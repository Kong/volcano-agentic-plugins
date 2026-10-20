# shellcheck shell=bash
# desc: build a local durable function that waits for a message -> send it, check the result and published progress
#
# Needs @volcano.dev/sdk >= 2.1 (ctx.waitForMessage and ctx.publish), volcano CLI
# >= 0.47.0 (older ones lack `durable messages`, so the send fails and reads as
# the agent's failure), and a local image with durable messages.
SCENARIO_PROMPT="Build a JavaScript Volcano durable function named 'publish-post' locally. It takes an input object with an integer 'post_id'. It first publishes a 'progress' message saying it is waiting, then waits up to one hour for a message named 'posted' whose data has a 'url' field, publishes a 'progress' message that includes that URL, and returns an object with a 'url' field holding it. Deploy it locally and test it end to end by sending a running execution its 'posted' message."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Reads a `messages list --json` page on stdin; succeeds when it holds a
# 'progress' message, one whose data includes $1 when given.
progress_published() {
  NEEDLE="${1-}" node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const progress = JSON.parse(s).data.filter((m) => m.name === "progress");
        process.exit(progress.some((m) => JSON.stringify(m.data ?? null).includes(process.env.NEEDLE)) ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });'
}

scenario_verify() {
  local artifact="$RESULTS_DIR/durable-messages-result.txt"
  : >"$artifact"
  local deployed="false" waits="false" sent="false" succeeded="false" waiting="false" published="false"
  local details="" start="" send="" execution="" listed="" id="" post_id=$(( 10000 + RANDOM ))
  # Nothing in the input, so a URL in the result or progress came from the message.
  local url="https://example.com/posts/$post_id-$RANDOM$RANDOM"
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
    # The waiting progress has to be out before the message that completes the post exists.
    for i in $(seq 1 20); do
      listed=$(volcano durable messages list publish-post "$id" --direction out --json 2>>"$artifact") || listed=""
      if echo "$listed" | progress_published; then waiting="true"; break; fi
      sleep 3
    done
    printf '\nPublished before the send:\n%s\n' "$listed" >>"$artifact"
    send=$(volcano durable messages send publish-post "$id" posted \
      --data "{\"url\":\"$url\"}" --idempotency-key "eval-$post_id" 2>&1) && sent="true"
    printf '\nSend:\n%s\n' "$send" >>"$artifact"
    for i in $(seq 1 20); do
      execution=$(volcano durable executions get publish-post "$id" 2>&1) || execution=""
      if echo "$execution" | grep -qE '^Status:[[:space:]]+(succeeded|failed|timed_out|stopped|unknown)'; then break; fi
      sleep 6
    done
    printf '\nExecution:\n%s\n' "$execution" >>"$artifact"
    # The CLI prints the result indented two spaces a level, so this is a
    # top-level field of an object result.
    if echo "$execution" | grep -qE '^Status:[[:space:]]+succeeded' &&
       echo "$execution" | grep -qE '^Result: [{]$' &&
       echo "$execution" | grep -qE "^  \"url\": \"$url\",?$"; then
      succeeded="true"
    fi
    listed=$(volcano durable messages list publish-post "$id" --direction out --json 2>>"$artifact") || listed=""
    printf '\nPublished:\n%s\n' "$listed" >>"$artifact"
    echo "$listed" | progress_published "$url" && published="true"
  fi
  [ "$deployed" = "true" ] && [ "$waits" = "true" ] && [ "$sent" = "true" ] &&
    [ "$succeeded" = "true" ] && [ "$waiting" = "true" ] && [ "$published" = "true" ] && PASS="true"
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS (durable function active, waits for and publishes messages in source, published progress before the message was sent, and the message resumed a fresh execution to the expected result and progress)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Function active:** $deployed | **waitForMessage + publish in source:** $waits | **Message sent:** $sent"
    echo "**Execution result correct:** $succeeded | **Progress before the send:** $waiting | **Progress with the URL:** $published"
    echo; echo 'See `durable-messages-result.txt` and `metrics.json`.'
  } >"$RESULTS_DIR/report.md"
}
