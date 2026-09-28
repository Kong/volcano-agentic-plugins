# shellcheck shell=bash
# desc: build a checkpointed local durable function -> start it and check the execution result
SCENARIO_PROMPT="Build a JavaScript Volcano durable function named 'double-number' locally. It takes an input object with an integer 'number'. Use two durable checkpointed steps: first double the number, then add one. Return an object with a 'value' field holding the result. Deploy it locally, start a test execution and check its result."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

scenario_verify() {
  local artifact="$RESULTS_DIR/durable-result.txt"
  : >"$artifact"
  local deployed="false" checkpointed="false" succeeded="false"
  local details="" start="" execution="" id="" number=$(( 10000 + RANDOM ))
  local i
  for i in $(seq 1 10); do
    details=$(volcano durable get double-number 2>&1) || details=""
    if echo "$details" | grep -qE '^Status:[[:space:]]+active'; then deployed="true"; break; fi
    sleep 6
  done
  printf 'Function:\n%s\n' "$details" >>"$artifact"
  local source_path="$SANDBOX_DIR/volcano/functions/double-number"
  if [ -d "$source_path" ] || [ -f "$source_path.js" ] || [ -f "$source_path.ts" ]; then
    [ "$(grep -RohE 'ctx[.]step[[:space:]]*\(' "$source_path" "$source_path.js" "$source_path.ts" --include='*.js' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')" -ge 2 ] && checkpointed="true"
  fi
  if [ "$deployed" = "true" ]; then
    start=$(volcano durable start double-number --input "{\"number\":$number}" 2>&1) || start=""
    printf '\nStart:\n%s\n' "$start" >>"$artifact"
    id=$(printf '%s\n' "$start" | sed -nE 's/^ID:[[:space:]]*([0-9a-f-]{36}).*/\1/p' | head -1)
    if [ -n "$id" ]; then
      local i
      for i in $(seq 1 20); do
        execution=$(volcano durable executions get double-number "$id" 2>&1) || execution=""
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
  [ "$deployed" = "true" ] && [ "$checkpointed" = "true" ] && [ "$succeeded" = "true" ] && PASS="true"
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS (durable function active, two checkpointed steps in source, fresh execution returned the expected value)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Function active:** $deployed | **Checkpointed:** $checkpointed | **Execution result correct:** $succeeded"
    echo; echo 'See `durable-result.txt` and `metrics.json`.'
  } >"$RESULTS_DIR/report.md"
}
