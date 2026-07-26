# shellcheck shell=bash
# desc: authenticated + authorized "deploy to cloud" -> deploy to a real project -> verify
#
# PRECONDITION: a Volcano hosting server at $CLAUDE_EVAL_CLOUD_API_URL (default
# http://localhost:8000, e.g. `make dev`) that accepts $CLAUDE_EVAL_CLOUD_TOKEN
# (default the local-dev platform token) and serves cloud function deploy.
# Exercises the post-auth cloud path (skills PR #34): project context, the
# confirm gate, deploy, and post-deploy verification.
SCENARIO_PROMPT="Deploy this app to the cloud. You have my explicit go-ahead to run the cloud deploy against the currently selected project."
SCENARIO_TIMEOUT=300

CLOUD_API_URL="${CLAUDE_EVAL_CLOUD_API_URL:-http://localhost:8000}"
CLOUD_TOKEN="${CLAUDE_EVAL_CLOUD_TOKEN:-pk-local-dev-token-00000000000000000000}"
EVAL_PROJECT="eval-cloud-$(date -u +%Y%m%d%H%M%S)"
EVAL_PROJECT_ID=""

scenario_setup() {
  export VOLCANO_API_URL="$CLOUD_API_URL"
  volcano login --token "$CLOUD_TOKEN" >/dev/null 2>&1 || { fail "token login failed against $CLOUD_API_URL"; return 1; }
  # Give the agent a real, isolated cloud project already selected, so the run
  # is reproducible and teardown can delete exactly what it created.
  local out; out=$(volcano projects create "$EVAL_PROJECT" 2>&1) || { fail "projects create failed: $out"; return 1; }
  EVAL_PROJECT_ID=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)
  volcano use "$EVAL_PROJECT" >/dev/null 2>&1 || { fail "volcano use $EVAL_PROJECT failed"; return 1; }
  (cd "$SANDBOX_DIR" && volcano init javascript >/dev/null 2>&1) || { fail "volcano init failed"; return 1; }
}

scenario_teardown() {
  [ -n "$EVAL_PROJECT_ID" ] && volcano projects delete "$EVAL_PROJECT_ID" --yes >/dev/null 2>&1 || true
}

# Pass = the harness can see a deployed function in the run's cloud project
# (independent of what the transcript claims). Uses cloud list, not the agent.
scenario_verify() {
  volcano use "$EVAL_PROJECT" >/dev/null 2>&1 || true
  local list; list="$(volcano cloud functions list 2>&1)"
  echo "$list" >"$RESULTS_DIR/cloud-functions-list.txt"
  # A deployed function shows a UUID row; "No functions deployed" / 0 shown = none.
  if echo "$list" | grep -qE '[0-9a-f]{8}-[0-9a-f]{4}-'; then PASS="true"; fi

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (>=1 function present in cloud project $EVAL_PROJECT)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo; echo "See \`cloud-functions-list.txt\` for the independent cloud check and \`metrics.json\` for friction."
  } >"$RESULTS_DIR/report.md"
}
