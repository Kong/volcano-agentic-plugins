# shellcheck shell=bash
# Shared eval core, sourced by run.sh once a scenario is loaded.
#
# Exposes: log / fail, eval_preflight, eval_reset_local_stack, run_agent.
# run_agent sets globals: AGENT_EXIT, AGENT_WALL_S (and writes the transcript).
#
# The one place the actual `claude` invocation lives — every scenario shares it,
# so the loading flags and AGENTS.md injection can't drift between runners.

log() { printf '[e2e-agent-eval] %s\n' "$*"; }
fail() { printf '[e2e-agent-eval] FAIL: %s\n' "$*" >&2; }

# Print a pid and all its descendants (depth-first). Used to snapshot the tree
# at kill time: killing by the captured pids is reparent-safe, so a backgrounded
# `volcano login` poller is still reaped after its `claude` parent exits (Claude
# Code runs background tasks in their own process group, so a group-kill misses
# them, but they remain descendants until the parent dies).
_eval_descendant_pids() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do echo "$child"; _eval_descendant_pids "$child"; done
}

# Machine-safe reap for the normal-exit case: record `volcano login` pids before
# the run, kill only ones that appear during it. An unrelated login already
# running in another terminal (in the snapshot) is left alone.
eval_snapshot_login_pids() { EVAL_LOGIN_PIDS_BEFORE=" $(pgrep -f 'volcano login' 2>/dev/null | tr '\n' ' ')"; }
eval_reap_new_logins() {
  local pid
  for pid in $(pgrep -f 'volcano login' 2>/dev/null); do
    case "${EVAL_LOGIN_PIDS_BEFORE:- }" in *" $pid "*) ;; *) kill -KILL "$pid" 2>/dev/null ;; esac
  done
}

# eval_preflight PLUGIN_DIR SCRIPT_DIR — validate the environment before spending
# a paid agent run. Returns non-zero (with a clear message) on any problem.
eval_preflight() {
  local plugin_dir=$1 script_dir=$2
  for bin in volcano claude docker node; do
    command -v "$bin" >/dev/null 2>&1 || { fail "$bin not found on PATH"; return 1; }
  done
  # @volcano.dev/sdk (used by invoke verifiers) declares engines.node >=20.
  local node_major; node_major=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
  if [ "$node_major" -lt 20 ]; then
    fail "node >=20 required (found $(node --version)) — @volcano.dev/sdk needs it"; return 1
  fi
  docker info >/dev/null 2>&1 || { fail "docker is not running"; return 1; }
  # Validate the plugin manifest parses and has the fields Claude Code needs,
  # not just that a file exists — a malformed plugin.json would otherwise fail
  # deep inside the agent run with a far less clear error.
  local manifest_error
  manifest_error=$(node -e '
    const fs = require("fs");
    let m; try { m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch (e) { console.log(`${process.argv[1]} is not valid JSON: ${e.message}`); process.exit(0); }
    if (!m.name || !m.version) console.log(`${process.argv[1]} is missing "name"/"version"`);
  ' "$plugin_dir/.claude-plugin/plugin.json" 2>&1) || manifest_error="$plugin_dir/.claude-plugin/plugin.json not found or unreadable"
  [ -z "$manifest_error" ] || { fail "$manifest_error"; return 1; }
  # Reconcile node_modules with package.json every run (npm is a no-op when
  # already current) so a stale SDK version from a prior checkout can't linger
  # and silently be used by the verifiers.
  log "syncing verification tooling deps (npm install)"
  (cd "$script_dir" && npm install --silent) || { fail "npm install for verification tooling failed"; return 1; }
}

# The CLI stores auth in ~/.volcano/config.json (no config-dir override exists;
# os.UserHomeDir wins). Auth scenarios call volcano login/logout, which would
# otherwise leave the developer's real session mutated. Snapshot it before the
# run and restore it on exit so an eval never logs the developer out.
eval_snapshot_cli_auth() {
  EVAL_CLI_CONFIG="$HOME/.volcano/config.json"
  EVAL_CLI_CONFIG_BACKUP=""
  if [ -f "$EVAL_CLI_CONFIG" ]; then
    EVAL_CLI_CONFIG_BACKUP="$(mktemp -t volcano-cli-config-XXXXXX)"
    cp "$EVAL_CLI_CONFIG" "$EVAL_CLI_CONFIG_BACKUP"
  fi
}
eval_restore_cli_auth() {
  [ -n "${EVAL_CLI_CONFIG:-}" ] || return 0
  if [ -n "${EVAL_CLI_CONFIG_BACKUP:-}" ] && [ -f "$EVAL_CLI_CONFIG_BACKUP" ]; then
    mkdir -p "$(dirname "$EVAL_CLI_CONFIG")"
    cp "$EVAL_CLI_CONFIG_BACKUP" "$EVAL_CLI_CONFIG"; rm -f "$EVAL_CLI_CONFIG_BACKUP"
  else
    rm -f "$EVAL_CLI_CONFIG"  # none before; drop whatever the eval created
  fi
}

# eval_reset_local_stack — force a clean shared local Volcano state, then hand
# back a *stopped* stack. `volcano start` is a machine-wide singleton (fixed
# container names + a fixed local project id), NOT scoped to the sandbox, so
# leftover functions/DBs from unrelated local work would contaminate a run.
# Leaving it stopped preserves the "did the agent start the stack itself?"
# signal that local scenarios check.
eval_reset_local_stack() {
  log "resetting shared local Volcano dev state for isolation"
  volcano start >/dev/null 2>&1 || { fail "could not start local stack for reset"; return 1; }
  volcano reset --yes >/dev/null 2>&1 || { fail "volcano reset failed"; return 1; }
  volcano stop >/dev/null 2>&1 || { fail "could not stop local stack before handing off to the agent"; return 1; }
}

# run_agent PROMPT MODEL TIMEOUT_SECS PLUGIN_DIR TRANSCRIPT STDERR
# Requires SANDBOX_DIR to be set. Runs a single-turn, non-interactive session
# with the plugin loaded from the working tree, tree-killed at the timeout.
run_agent() {
  local prompt=$1 model=$2 timeout_s=$3 plugin_dir=$4 transcript=$5 stderr=$6

  # Inject AGENTS.md + a non-interactive note as the system prompt.
  #  - AGENTS.md carries the load-bearing rules (build -> auto local deploy,
  #    cloud ordering, never-auto-cloud) that live there, NOT in the on-invoke
  #    skills. --setting-sources project,local (below) excludes the user scope
  #    that normally carries AGENTS.md via ~/.claude/CLAUDE.md, so we re-inject
  #    it here to replicate the real UX.
  #  - The note tells the agent this harness has no human to answer a
  #    "shall I proceed?" plan-check, so it should act rather than stop.
  local system_note; system_note="$(cat "$plugin_dir/skills/AGENTS.md")

This is a non-interactive, single-turn evaluation session — no human is available to answer a follow-up confirmation question. If you would normally pause to ask before executing a plan, proceed directly instead."

  # --plugin-dir loads the plugin from this repo's working tree (not the
  #   possibly-stale installed copy) and, unlike the marketplace install, does
  #   not depend on the "user" settings scope excluded below.
  # --setting-sources project,local excludes "user" scope so a machine's global
  #   ~/.claude/CLAUDE.md (which may import a corrupted ~/.volcano/AGENTS.md)
  #   can't derail the run into a prompt-injection refusal.
  local args=(
    -p "$prompt"
    --model "$model"
    --permission-mode bypassPermissions
    --plugin-dir "$plugin_dir"
    --setting-sources project,local
    --output-format stream-json
    --append-system-prompt "$system_note"
    --verbose
  )
  [ -n "${CLAUDE_EVAL_MAX_BUDGET_USD:-}" ] && args+=(--max-budget-usd "$CLAUDE_EVAL_MAX_BUDGET_USD")

  local start; start=$(date +%s)
  ( cd "$SANDBOX_DIR" && claude "${args[@]}" ) >"$transcript" 2>"$stderr" &
  local agent_pid=$!
  # Watchdog: at the timeout, snapshot the whole descendant tree (children are
  # still attached), TERM it, then KILL the SAME pids after a grace period.
  # Snapshotting first makes the KILL land even after the parent exits and
  # reparents a slow-to-die child.
  ( sleep "$timeout_s"
    local pids; pids="$(_eval_descendant_pids "$agent_pid") $agent_pid"
    for p in $pids; do kill -TERM "$p" 2>/dev/null; done
    sleep 3
    for p in $pids; do kill -KILL "$p" 2>/dev/null; done
  ) >/dev/null 2>&1 &
  local watchdog_pid=$!
  disown "$watchdog_pid" 2>/dev/null || true
  wait "$agent_pid" 2>/dev/null; AGENT_EXIT=$?
  kill "$watchdog_pid" 2>/dev/null  # stop the watchdog if the agent finished first
  AGENT_WALL_S=$(( $(date +%s) - start ))
}
