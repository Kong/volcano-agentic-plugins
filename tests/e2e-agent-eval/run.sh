#!/usr/bin/env bash
# Runs the todo-api-functions-local scenario (see scenario.md): a bare "build
# me a todo API" prompt against Claude Code + the volcano plugin, in a fresh
# scratch directory, local mode only. See README.md for env vars and output.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT="${CLAUDE_EVAL_PROMPT:-Build me a todo API.}"
MODEL="${CLAUDE_EVAL_MODEL:-sonnet}"
TIMEOUT_SECS="${CLAUDE_EVAL_TIMEOUT_SECS:-900}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RESULTS_DIR="$SCRIPT_DIR/results/$RUN_ID"

log() { printf '[e2e-agent-eval] %s\n' "$*"; }
fail() { printf '[e2e-agent-eval] FAIL: %s\n' "$*" >&2; }

log "preflight checks"
for bin in volcano claude docker node; do
  command -v "$bin" >/dev/null 2>&1 || { fail "$bin not found on PATH"; exit 1; }
done
docker info >/dev/null 2>&1 || { fail "docker is not running"; exit 1; }
if ! claude plugin list 2>/dev/null | grep -q '^  ❯ volcano@volcano-agentic-plugins'; then
  fail "volcano@volcano-agentic-plugins plugin not installed/enabled — run: claude plugin marketplace update volcano-agentic-plugins"
  exit 1
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
volcano stop >/dev/null 2>&1 || true

SANDBOX_DIR="$(mktemp -d -t volcano-e2e-eval-XXXXXX)"
mkdir -p "$RESULTS_DIR"
log "sandbox: $SANDBOX_DIR"
log "results: $RESULTS_DIR"

cleanup() {
  if [ -d "$SANDBOX_DIR/volcano" ]; then
    (cd "$SANDBOX_DIR" && volcano stop >/dev/null 2>&1) || true
  fi
  if [ -z "${CLAUDE_EVAL_KEEP_SANDBOX:-}" ]; then
    rm -rf "$SANDBOX_DIR"
  else
    log "keeping sandbox (CLAUDE_EVAL_KEEP_SANDBOX set): $SANDBOX_DIR"
  fi
}
trap cleanup EXIT

log "running agent (model=$MODEL, timeout=${TIMEOUT_SECS}s)"
CLAUDE_ARGS=(
  -p "$PROMPT"
  --model "$MODEL"
  --permission-mode bypassPermissions
  --output-format stream-json
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
{
  echo '{'
  if [ -d "$SANDBOX_DIR/volcano" ]; then
    STATUS_OUT="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
    LOCAL_UP=$(echo "$STATUS_OUT" | grep -qi "running" && echo true || echo false)
    printf '  "volcano_dir_present": true,\n'
    printf '  "local_stack_up": %s,\n' "$LOCAL_UP"

    FUNCTIONS_OUT="$(cd "$SANDBOX_DIR" && volcano functions list 2>&1)"
    FN_NAMES=$(echo "$FUNCTIONS_OUT" | awk '
      /^-+$/ { next }
      /^Name[[:space:]]/ { next }
      /^No functions/ { next }
      /^Showing/ { next }
      NF==0 { next }
      { print $1 }
    ')
    printf '  "functions_list_raw": %s,\n' "$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' <<<"$FUNCTIONS_OUT")"
    printf '  "invocations": [\n'
    FIRST=1
    for name in $FN_NAMES; do
      [ "$FIRST" -eq 1 ] || printf ',\n'
      FIRST=0
      INVOKE_OUT="$(cd "$SANDBOX_DIR" && volcano functions invoke "$name" --json 2>&1)"
      printf '    {"name": %s, "response": %s}' \
        "$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$name")" \
        "$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8")))' <<<"$INVOKE_OUT")"
    done
    printf '\n  ]\n'
  else
    printf '  "volcano_dir_present": false,\n'
    printf '  "local_stack_up": false,\n'
    printf '  "invocations": []\n'
  fi
  echo '}'
} >"$VERIFY_JSON"

log "analyzing transcript"
node "$SCRIPT_DIR/analyze-transcript.mjs" "$RESULTS_DIR/transcript.jsonl" >"$RESULTS_DIR/metrics.json" \
  || fail "transcript analysis failed (see $RESULTS_DIR/transcript.jsonl directly)"

PASS="false"
if node -e '
  const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const ok = (v.invocations || []).some((i) => {
    try { const r = JSON.parse(i.response); return r && !r.error; } catch { return false; }
  });
  process.exit(ok ? 0 : 1);
' "$VERIFY_JSON"; then
  PASS="true"
fi

{
  echo "# Result: todo-api-functions-local ($RUN_ID)"
  echo
  echo "**Pass:** $PASS  (at least one deployed function invoked successfully)"
  echo "**Agent exit code:** $AGENT_EXIT"
  echo "**Agent wall time:** $((AGENT_END - AGENT_START))s"
  echo
  echo "See \`metrics.json\` for friction signals and \`verification.json\` for the independent invoke results."
} >"$RESULTS_DIR/report.md"

log "pass=$PASS — see $RESULTS_DIR/report.md"
[ "$PASS" = "true" ] && exit 0 || exit 1
