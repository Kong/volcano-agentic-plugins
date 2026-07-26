#!/usr/bin/env bash
# Scenario-driven agent eval runner.
#
#   ./run.sh [scenario]            # default: todo-api-local
#   ./run.sh --list                # list available scenarios
#
# A scenario lives in scenarios/<name>/scenario.sh and sets SCENARIO_PROMPT /
# SCENARIO_TIMEOUT and optionally defines scenario_setup / scenario_verify /
# scenario_teardown. The shared invocation + metrics live in lib/run-agent.sh
# and analyze-transcript.mjs. See README.md.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../../plugins/claude-code" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"

# shellcheck source=lib/run-agent.sh
source "$SCRIPT_DIR/lib/run-agent.sh"

if [ "${1:-}" = "--list" ]; then
  echo "Available scenarios:"
  for d in "$SCENARIOS_DIR"/*/; do
    name="$(basename "$d")"
    desc="$(sed -n 's/^# desc: //p' "$d/scenario.sh" 2>/dev/null | head -1)"
    printf "  %-20s %s\n" "$name" "$desc"
  done
  exit 0
fi

SCENARIO="${1:-todo-api-local}"
SCENARIO_FILE="$SCENARIOS_DIR/$SCENARIO/scenario.sh"
[ -f "$SCENARIO_FILE" ] || { fail "unknown scenario '$SCENARIO' (see: $0 --list)"; exit 1; }

# Scenario defaults; scenario.sh overrides these and may define the hooks.
SCENARIO_PROMPT=""
SCENARIO_TIMEOUT=600
scenario_setup() { :; }     # runs before the agent (SANDBOX_DIR is set)
scenario_verify() { :; }    # runs after; must set PASS=true/false and write report
scenario_teardown() { :; }  # best-effort cleanup on exit
# shellcheck source=/dev/null
source "$SCENARIO_FILE"
[ -n "$SCENARIO_PROMPT" ] || { fail "scenario '$SCENARIO' did not set SCENARIO_PROMPT"; exit 1; }

# Env overrides (CI / one-offs) win over the scenario's defaults.
PROMPT="${CLAUDE_EVAL_PROMPT:-$SCENARIO_PROMPT}"
MODEL="${CLAUDE_EVAL_MODEL:-sonnet}"
TIMEOUT_SECS="${CLAUDE_EVAL_TIMEOUT_SECS:-$SCENARIO_TIMEOUT}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RESULTS_DIR="$SCRIPT_DIR/results/$SCENARIO/$RUN_ID"

log "scenario: $SCENARIO"
eval_preflight "$PLUGIN_DIR" "$SCRIPT_DIR" || exit 1

SANDBOX_DIR="$(mktemp -d -t volcano-e2e-eval-XXXXXX)"
TRANSCRIPT="$RESULTS_DIR/transcript.jsonl"
METRICS_JSON="$RESULTS_DIR/metrics.json"
mkdir -p "$RESULTS_DIR"
log "sandbox: $SANDBOX_DIR"
log "results: $RESULTS_DIR"
export SANDBOX_DIR SCRIPT_DIR PLUGIN_DIR RESULTS_DIR TRANSCRIPT METRICS_JSON

cleanup() {
  eval_reap_new_logins || true           # reap any `volcano login` the agent left running (new pids only)
  scenario_teardown || true              # while the eval's CLI auth is still active
  eval_restore_cli_auth || true          # then put the developer's real auth back
  (cd "$SANDBOX_DIR" 2>/dev/null && volcano stop >/dev/null 2>&1) || true
  if [ -z "${CLAUDE_EVAL_KEEP_SANDBOX:-}" ]; then rm -rf "$SANDBOX_DIR"
  else log "keeping sandbox (CLAUDE_EVAL_KEEP_SANDBOX set): $SANDBOX_DIR"; fi
}
trap cleanup EXIT

eval_snapshot_cli_auth  # preserve the developer's ~/.volcano auth across the run
log "scenario setup"
scenario_setup || { fail "scenario setup failed"; exit 1; }

log "running agent (model=$MODEL, timeout=${TIMEOUT_SECS}s)"
eval_snapshot_login_pids  # so cleanup only reaps logins this run started
run_agent "$PROMPT" "$MODEL" "$TIMEOUT_SECS" "$PLUGIN_DIR" "$TRANSCRIPT" "$RESULTS_DIR/stderr.log"
log "agent exited $AGENT_EXIT after ${AGENT_WALL_S}s"

log "analyzing transcript"
node "$SCRIPT_DIR/analyze-transcript.mjs" "$TRANSCRIPT" >"$METRICS_JSON" \
  || fail "transcript analysis failed (see $TRANSCRIPT directly)"

log "scenario verification (harness-run, not agent-run)"
PASS="false"
scenario_verify || true

# Fallback report if the scenario didn't write one.
[ -f "$RESULTS_DIR/report.md" ] || {
  printf '# Result: %s (%s)\n\n**Pass:** %s\n**Agent exit:** %s\n**Wall time:** %ss\n\nSee metrics.json for friction signals.\n' \
    "$SCENARIO" "$RUN_ID" "$PASS" "$AGENT_EXIT" "$AGENT_WALL_S" >"$RESULTS_DIR/report.md"
}

log "pass=$PASS — see $RESULTS_DIR/report.md"
[ "$PASS" = "true" ] && exit 0 || exit 1
