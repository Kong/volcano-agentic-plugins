# shellcheck shell=bash
# desc: build a local durable function that waits for a message -> send it, check the result and published progress
#
# Needs @volcano.dev/sdk >= 2.1 (ctx.waitForMessage and ctx.publish) and a local
# image with durable messages.
SCENARIO_PROMPT="Build a JavaScript Volcano durable function named 'publish-post' locally. It takes an input object with a 'post_id'. It first publishes a 'progress' message saying it is waiting, then waits up to one hour for a message named 'posted' whose data has a 'url' field, publishes a 'progress' message that includes that URL, and returns an object with a 'url' field holding it. Deploy it locally and test it end to end by sending a running execution its 'posted' message."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

scenario_verify() {
  local artifact="$RESULTS_DIR/durable-messages-result.txt"
  : >"$artifact"
  local deployed="false" waits="false" sent="false" succeeded="false" published="false"
  local details="" start="" send="" execution="" listed="" id="" post_id=$(( 10000 + RANDOM ))
  local url="https://example.com/posts/$post_id"
  local i
  for i in $(seq 1 10); do
    details=$(volcano durable get publish-post 2>&1) || details=""
    if echo "$details" | grep -qE '^Status:[[:space:]]+active'; then deployed="true"; break; fi
    sleep 6
  done
  printf 'Function:\n%s\n' "$details" >>"$artifact"
  local source_path="$SANDBOX_DIR/volcano/functions/publish-post"
  if [ -d "$source_path" ] || [ -f "$source_path.js" ] || [ -f "$source_path.ts" ]; then
    grep -RqsE 'waitForMessage[[:space:]]*\(' "$source_path" "$source_path.js" "$source_path.ts" \
      --include='*.js' --include='*.ts' --exclude-dir=node_modules 2>/dev/null &&
      grep -RqsE '[.]publish[[:space:]]*\(' "$source_path" "$source_path.js" "$source_path.ts" \
        --include='*.js' --include='*.ts' --exclude-dir=node_modules 2>/dev/null &&
      waits="true"
  fi
  if [ "$deployed" = "true" ]; then
    start=$(volcano durable start publish-post --input "{\"post_id\":$post_id}" 2>&1) || start=""
    printf '\nStart:\n%s\n' "$start" >>"$artifact"
    id=$(printf '%s\n' "$start" | sed -nE 's/^ID:[[:space:]]*([0-9a-f-]{36}).*/\1/p' | head -1)
  fi
  if [ -n "$id" ]; then
    # A message sent before the function reaches its wait is queued for it.
    send=$(volcano durable messages send publish-post "$id" posted \
      --data "{\"url\":\"$url\"}" --idempotency-key "eval-$post_id" 2>&1) && sent="true"
    printf '\nSend:\n%s\n' "$send" >>"$artifact"
    for i in $(seq 1 20); do
      execution=$(volcano durable executions get publish-post "$id" 2>&1) || execution=""
      if echo "$execution" | grep -qE '^Status:[[:space:]]+(succeeded|failed|timed_out|stopped|unknown)'; then break; fi
      sleep 6
    done
    printf '\nExecution:\n%s\n' "$execution" >>"$artifact"
    if echo "$execution" | grep -qE '^Status:[[:space:]]+succeeded' &&
       echo "$execution" | grep -qE "^[[:space:]]*\"url\":[[:space:]]*\"$url\""; then
      succeeded="true"
    fi
    listed=$(volcano durable messages list publish-post "$id" --direction out --json 2>&1) || listed=""
    printf '\nPublished:\n%s\n' "$listed" >>"$artifact"
    # Both progress messages: one before the wait, and one carrying the URL.
    echo "$listed" | URL="$url" node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const progress = JSON.parse(s).data.filter((m) => m.name === "progress");
          const withUrl = progress.some((m) => JSON.stringify(m.data).includes(process.env.URL));
          process.exit(progress.length >= 2 && withUrl ? 0 : 1);
        } catch {
          process.exit(1);
        }
      });' && published="true"
  fi
  [ "$deployed" = "true" ] && [ "$waits" = "true" ] && [ "$sent" = "true" ] &&
    [ "$succeeded" = "true" ] && [ "$published" = "true" ] && PASS="true"
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS (durable function active, waits for and publishes messages in source, a sent message resumed a fresh execution to the expected result, and its progress was published)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Function active:** $deployed | **waitForMessage + publish in source:** $waits | **Message sent:** $sent"
    echo "**Execution result correct:** $succeeded | **Progress published:** $published"
    echo; echo 'See `durable-messages-result.txt` and `metrics.json`.'
  } >"$RESULTS_DIR/report.md"
}
