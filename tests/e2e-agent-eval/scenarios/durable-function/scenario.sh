# shellcheck shell=bash
# desc: build a checkpointed durable function -> start it and check the execution result
# Requires a hosting server with durable execution support (CLAUDE_EVAL_CLOUD_API_URL).
SCENARIO_PROMPT="Build and deploy a JavaScript Volcano durable function named 'double-number' in the selected cloud project. It takes an input object with an integer 'number'. Use two durable checkpointed steps: first double the number, then add one. Return an object with a 'value' field holding the result. Start a test execution and check its result. You have my explicit go-ahead to deploy to the selected cloud project."
SCENARIO_TIMEOUT=900

CLOUD_API_URL="${CLAUDE_EVAL_CLOUD_API_URL:-http://localhost:8000}"
CLOUD_TOKEN="${CLAUDE_EVAL_CLOUD_TOKEN:-pk-local-dev-token-00000000000000000000}"
EVAL_PROJECT="eval-durable-$(date -u +%Y%m%d%H%M%S)"
EVAL_PROJECT_ID=""

scenario_setup() {
  export VOLCANO_API_URL="$CLOUD_API_URL"
  volcano login --token "$CLOUD_TOKEN" >/dev/null 2>&1 || { fail "token login failed against $CLOUD_API_URL"; return 1; }
  local out
  out=$(volcano projects create "$EVAL_PROJECT" 2>&1) || { fail "projects create failed: $out"; return 1; }
  EVAL_PROJECT_ID=$(echo "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)
  [ -n "$EVAL_PROJECT_ID" ] || { fail "projects create returned no project ID: $out"; return 1; }
  volcano use "$EVAL_PROJECT" >/dev/null 2>&1 || { fail "volcano use $EVAL_PROJECT failed"; return 1; }
  (cd "$SANDBOX_DIR" && volcano init javascript >/dev/null 2>&1) || { fail "volcano init failed"; return 1; }
  unset CLAUDE_EVAL_CLOUD_TOKEN CLOUD_TOKEN
}

scenario_teardown() {
  [ -n "$EVAL_PROJECT_ID" ] && volcano projects delete "$EVAL_PROJECT_ID" --yes >/dev/null 2>&1 || true
}

scenario_verify() {
  local artifact="$RESULTS_DIR/durable-result.txt"
  : >"$artifact"
  local selected="false" deployed="false" checkpointed="false" succeeded="false"
  local details="" start="" execution="" id="" number=$(( 10000 + RANDOM ))
  if volcano use "$EVAL_PROJECT" >/dev/null 2>&1; then
    selected="true"
    # Check the named function in the durable collection, not the standard one.
    local i
    for i in $(seq 1 10); do
      details=$(volcano cloud durable get double-number 2>&1) || details=""
      if echo "$details" | grep -qE '^Status:[[:space:]]+active'; then deployed="true"; break; fi
      sleep 6
    done
    printf 'Function:\n%s\n' "$details" >>"$artifact"
  fi
  local source_path="$SANDBOX_DIR/volcano/functions/double-number"
  if [ -d "$source_path" ] || [ -f "$source_path.js" ] || [ -f "$source_path.ts" ]; then
    [ "$(grep -RohE 'ctx[.]step[[:space:]]*\(' "$source_path" "$source_path.js" "$source_path.ts" --include='*.js' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')" -ge 2 ] && checkpointed="true"
  fi
  if [ "$deployed" = "true" ]; then
    start=$(volcano cloud durable start double-number --input "{\"number\":$number}" 2>&1) || start=""
    printf '\nStart:\n%s\n' "$start" >>"$artifact"
    id=$(printf '%s\n' "$start" | sed -nE 's/^ID:[[:space:]]*([0-9a-f-]{36}).*/\1/p' | head -1)
    if [ -n "$id" ]; then
      local i
      for i in $(seq 1 20); do
        execution=$(volcano cloud durable executions get double-number "$id" 2>&1) || execution=""
        if echo "$execution" | grep -qE '^Status:[[:space:]]+(succeeded|failed|timed_out|stopped|unknown)'; then break; fi
        sleep 6
      done
      printf '\nExecution:\n%s\n' "$execution" >>"$artifact"
      if echo "$execution" | grep -qE '^Status:[[:space:]]+succeeded' &&
         echo "$execution" | grep -qE "^[[:space:]]*\"value\":[[:space:]]*$(( number * 2 + 1 ))[,}]?"; then
        succeeded="true"
      fi
    fi
  fi
  [ "$selected" = "true" ] && [ "$deployed" = "true" ] && [ "$checkpointed" = "true" ] && [ "$succeeded" = "true" ] && PASS="true"
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS (durable function active, two checkpointed steps in source, fresh execution returned the expected value)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Project selected:** $selected | **Function active:** $deployed | **Checkpointed:** $checkpointed | **Execution result correct:** $succeeded"
    echo; echo 'See `durable-result.txt` and `metrics.json`.'
  } >"$RESULTS_DIR/report.md"
}
