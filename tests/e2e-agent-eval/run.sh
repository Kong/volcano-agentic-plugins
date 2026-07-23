#!/usr/bin/env bash
# Runs the todo-api-functions-local scenario (see scenario.md): a bare "build
# me a todo API" prompt against Claude Code + the volcano plugin, in a fresh
# scratch directory, local mode only. See README.md for env vars and output.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT="${CLAUDE_EVAL_PROMPT:-Build me a todo API using volcano.}"
MODEL="${CLAUDE_EVAL_MODEL:-sonnet}"
TIMEOUT_SECS="${CLAUDE_EVAL_TIMEOUT_SECS:-600}"  # a simple todo API build/deploy/verify should not need longer than this
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RESULTS_DIR="$SCRIPT_DIR/results/$RUN_ID"

log() { printf '[e2e-agent-eval] %s\n' "$*"; }
fail() { printf '[e2e-agent-eval] FAIL: %s\n' "$*" >&2; }

log "preflight checks"
for bin in volcano claude docker node; do
  command -v "$bin" >/dev/null 2>&1 || { fail "$bin not found on PATH"; exit 1; }
done
# @volcano.dev/sdk declares engines.node >=20 (used by invoke-with-auth.mjs) —
# fail preflight with a clear message rather than a confusing runtime error
# from `npm install` (which may only warn) or the verifier itself later.
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "node >=20 required (found $(node --version)) — @volcano.dev/sdk (invoke-with-auth.mjs) requires it"
  exit 1
fi
docker info >/dev/null 2>&1 || { fail "docker is not running"; exit 1; }
if ! claude plugin list 2>/dev/null | grep -q 'volcano@volcano-agentic-plugins'; then
  fail "volcano@volcano-agentic-plugins plugin not installed/enabled — run: claude plugin marketplace update volcano-agentic-plugins"
  exit 1
fi
if [ ! -d "$SCRIPT_DIR/node_modules/@volcano.dev/sdk" ]; then
  log "installing verification tooling deps (@volcano.dev/sdk)"
  (cd "$SCRIPT_DIR" && npm install --silent) || { fail "npm install for verification tooling failed"; exit 1; }
fi

# `volcano start` is a single machine-wide singleton (fixed container names,
# a fixed local project ID) — it is NOT scoped to the scratch directory the
# agent runs in. Any function/database left over from unrelated local work
# on this machine would otherwise contaminate this run's results (a prior
# run of this exact harness left over a dozen unrelated functions the first
# time this was tried). Force a clean slate before the agent ever runs,
# without starting the stack ourselves and leaving it running — the agent
# still has to run `volcano start` itself for the rest of the scenario.
log "resetting shared local Volcano dev state for isolation"
volcano start >/dev/null 2>&1 || { fail "could not start local stack for reset"; exit 1; }
volcano reset --yes >/dev/null 2>&1 || { fail "volcano reset failed"; exit 1; }
# Must not silently continue on failure here: if this stop fails and the
# stack stays running, the agent could observe an already-running stack and
# skip `volcano start` itself, corrupting the "did it start the stack
# unprompted" signal this scenario is specifically checking (see scenario.md).
volcano stop >/dev/null 2>&1 || { fail "could not stop local stack before handing off to the agent"; exit 1; }

SANDBOX_DIR="$(mktemp -d -t volcano-e2e-eval-XXXXXX)"
mkdir -p "$RESULTS_DIR"
log "sandbox: $SANDBOX_DIR"
log "results: $RESULTS_DIR"

cleanup() {
  # Unconditional and best-effort: the stack is a machine-wide singleton, not
  # scoped to $SANDBOX_DIR, so whether the agent scaffolded `volcano/` at the
  # sandbox's top level (it might nest it in a subdirectory instead) has no
  # bearing on whether Docker containers are actually running that need
  # stopping. Gating this on `-d "$SANDBOX_DIR/volcano"` previously meant a
  # run where the agent called `volcano start` but hadn't (yet) scaffolded —
  # or scaffolded elsewhere — leaked the stack running after the harness exited.
  (cd "$SANDBOX_DIR" 2>/dev/null && volcano stop >/dev/null 2>&1) || true
  if [ -z "${CLAUDE_EVAL_KEEP_SANDBOX:-}" ]; then
    rm -rf "$SANDBOX_DIR"
  else
    log "keeping sandbox (CLAUDE_EVAL_KEEP_SANDBOX set): $SANDBOX_DIR"
  fi
}
trap cleanup EXIT

log "running agent (model=$MODEL, timeout=${TIMEOUT_SECS}s)"
# Methodology note: this is a single-turn, non-interactive (-p) session, so
# there is no human available to answer a "want me to proceed?" plan-check
# question the agent might otherwise (correctly, per its own global/user
# instructions) ask before executing. Without this, a run can complete with
# zero build steps taken, having only presented a plan. This does not change
# the scenario prompt itself (still bare per scenario.md) — it only tells the
# agent that this specific harness has no one to confirm with.
EVAL_SYSTEM_NOTE="This is a non-interactive, single-turn evaluation session — no human is available to answer a follow-up confirmation question. If you would normally pause to ask before executing a plan, proceed directly instead."

CLAUDE_ARGS=(
  -p "$PROMPT"
  --model "$MODEL"
  --permission-mode bypassPermissions
  --output-format stream-json
  --append-system-prompt "$EVAL_SYSTEM_NOTE"
  --verbose
)
[ -n "${CLAUDE_EVAL_MAX_BUDGET_USD:-}" ] && CLAUDE_ARGS+=(--max-budget-usd "$CLAUDE_EVAL_MAX_BUDGET_USD")

AGENT_START=$(date +%s)
(
  cd "$SANDBOX_DIR" && timeout "$TIMEOUT_SECS" claude "${CLAUDE_ARGS[@]}"
) >"$RESULTS_DIR/transcript.jsonl" 2>"$RESULTS_DIR/stderr.log"
AGENT_EXIT=$?
AGENT_END=$(date +%s)
log "agent exited $AGENT_EXIT after $((AGENT_END - AGENT_START))s"

log "independent verification (harness-run, not agent-run)"
VERIFY_JSON="$RESULTS_DIR/verification.json"
if [ -d "$SANDBOX_DIR/volcano" ]; then
  STATUS_OUT="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  LOCAL_UP=$(echo "$STATUS_OUT" | grep -qi "running" && echo true || echo false)

  FUNCTIONS_OUT="$(cd "$SANDBOX_DIR" && volcano functions list 2>&1)"

  # Discover names from the scaffold on disk, not `volcano functions list`'s
  # human-readable table: that table truncates names over ~20 chars with
  # `...` (confirmed against the live CLI), which would extract a truncated,
  # unresolvable name and wrongly fail a correctly-deployed function with a
  # long name. `volcano/functions/` entries map 1:1 to function names per
  # the platform skill's own scanner rules (one file or one directory per
  # function; `_`-prefixed entries are shared code, not functions).
  FN_NAMES=""
  if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
    FN_NAMES=$(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u)
  fi

  # `volcano functions invoke` (CLI) has no way to supply a bearer token, and
  # a correctly-built function requires __volcano_auth and 401s without one
  # (tracked separately as a CLI gap, not fixed here). Mint a real session via
  # the SDK and invoke authenticated — see invoke-with-auth.mjs — instead of
  # testing unauthenticated, which would fail a correctly-secured function
  # and pass an insecure one.
  AUTH_RESULT='{"auth_error": null, "invocations": []}'
  if [ -n "$FN_NAMES" ]; then
    API_URL=$(echo "$STATUS_OUT" | grep "API URL:" | awk '{print $NF}')
    ANON_KEY=$(echo "$STATUS_OUT" | grep "Anon Key:" | awk '{print $NF}')
    if [ -n "$API_URL" ] && [ -n "$ANON_KEY" ]; then
      AUTH_RESULT=$(node "$SCRIPT_DIR/invoke-with-auth.mjs" "$API_URL" "$ANON_KEY" $FN_NAMES 2>"$RESULTS_DIR/invoke-with-auth.stderr.log")
      if [ -z "$AUTH_RESULT" ]; then
        AUTH_RESULT='{"auth_error": "invoke-with-auth.mjs produced no output — see invoke-with-auth.stderr.log", "invocations": []}'
      fi
    else
      AUTH_RESULT='{"auth_error": "could not read API URL/anon key from volcano status", "invocations": []}'
    fi
  fi

  node -e '
    const [volcanoDirPresent, localStackUp, functionsListRaw, authResultJson] = process.argv.slice(1);
    const authResult = JSON.parse(authResultJson);
    process.stdout.write(JSON.stringify({
      volcano_dir_present: volcanoDirPresent === "true",
      local_stack_up: localStackUp === "true",
      functions_list_raw: functionsListRaw,
      auth_error: authResult.auth_error,
      invocations: authResult.invocations,
    }, null, 2) + "\n");
  ' true "$LOCAL_UP" "$FUNCTIONS_OUT" "$AUTH_RESULT" >"$VERIFY_JSON"
else
  cat >"$VERIFY_JSON" <<'EOF'
{"volcano_dir_present": false, "local_stack_up": false, "functions_list_raw": "", "auth_error": null, "invocations": []}
EOF
fi

log "analyzing transcript"
node "$SCRIPT_DIR/analyze-transcript.mjs" "$RESULTS_DIR/transcript.jsonl" >"$RESULTS_DIR/metrics.json" \
  || fail "transcript analysis failed (see $RESULTS_DIR/transcript.jsonl directly)"

PASS="false"
if node -e '
  const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  // Per scenario.md: "2xx, parseable JSON body" — a 2xx status with a
  // non-JSON string body (the SDK returns raw strings for non-JSON
  // responses) must not count as a pass.
  const isParseableJson = (data) => {
    if (data !== null && typeof data === "object") return true;
    if (typeof data !== "string") return false;
    try { JSON.parse(data); return true; } catch { return false; }
  };
  const ok = (v.invocations || []).some((i) =>
    !i.error && i.status >= 200 && i.status < 300 && isParseableJson(i.data)
  );
  process.exit(ok ? 0 : 1);
' "$VERIFY_JSON"; then
  PASS="true"
fi

AUTH_ERROR_NOTE=$(node -e '
  const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (v.auth_error) process.stdout.write(v.auth_error);
' "$VERIFY_JSON" 2>/dev/null || true)

{
  echo "# Result: todo-api-functions-local ($RUN_ID)"
  echo
  echo "**Pass:** $PASS  (at least one deployed function invoked successfully, authenticated)"
  echo "**Agent exit code:** $AGENT_EXIT"
  echo "**Agent wall time:** $((AGENT_END - AGENT_START))s"
  if [ -n "$AUTH_ERROR_NOTE" ]; then
    echo
    echo "**Note:** a non-pass here may be a harness verification problem, not a build failure — auth_error: $AUTH_ERROR_NOTE"
  fi
  echo
  echo "See \`metrics.json\` for friction signals and \`verification.json\` for the independent invoke results."
} >"$RESULTS_DIR/report.md"

log "pass=$PASS — see $RESULTS_DIR/report.md"
[ "$PASS" = "true" ] && exit 0 || exit 1
