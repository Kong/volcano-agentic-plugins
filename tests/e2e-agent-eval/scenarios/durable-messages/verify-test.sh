#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
source "$(dirname "$0")/scenario.sh"
SANDBOX_DIR=$(mktemp -d)
RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$SANDBOX_DIR" "$RESULTS_DIR"' EXIT
SCENARIO=durable-messages RUN_ID=test AGENT_EXIT=0 AGENT_WALL_S=1
SENT_FLAG="$RESULTS_DIR/sent"
mkdir -p "$SANDBOX_DIR/volcano/functions/publish-post"
printf '%s\n' 'await ctx.publish("progress", {}); await ctx.waitForMessage("posted", { timeout: "1h" });' \
  >"$SANDBOX_DIR/volcano/functions/publish-post/index.js"
sleep() { :; }
# The scenario calls volcano in subshells, so whether the send happened lives in a file.
volcano() {
  case "$*" in
    'durable get publish-post') printf 'Status: active\n' ;;
    'durable start publish-post --input '* ) printf 'ID: 11111111-1111-4111-8111-111111111111\n' ;;
    'durable messages send publish-post '* ) [ "$SEND_OK" = true ] && touch "$SENT_FLAG" ;;
    'durable executions get publish-post '* ) printf 'Status: succeeded\nResult: {\n  "url": "%s"\n}\n' "$RESULT_URL" ;;
    'durable messages list publish-post '*'--direction out --json')
      local published=$BEFORE
      [ -f "$SENT_FLAG" ] && published=$AFTER
      echo 'update available' >&2
      printf '{"data":[%s],"has_more":false}\n' "$published" ;;
    *) return 1 ;;
  esac
}
# Fix the random input so the mock can return the matching URL.
RANDOM=1234
post_id=$(( 10000 + RANDOM ))
URL="https://example.com/posts/$post_id-$RANDOM$RANDOM"
waiting='{"name":"progress","data":{"stage":"waiting"}}'
done_='{"name":"progress","data":{"url":"'"$URL"'"}}'
guessed='{"name":"progress","data":{"url":"https://example.com/posts/'"$post_id"'"}}'

check() {
  RANDOM=1234
  rm -f "$SENT_FLAG"
  PASS=false
  scenario_verify
  [ "$PASS" = "$1" ]
}

SEND_OK=true RESULT_URL=$URL BEFORE="$waiting" AFTER="$waiting,$done_" check true
SEND_OK=false RESULT_URL=$URL BEFORE="$waiting" AFTER="$waiting,$done_" check false
SEND_OK=true RESULT_URL=https://example.com/other BEFORE="$waiting" AFTER="$waiting,$done_" check false
SEND_OK=true RESULT_URL=$URL BEFORE="$waiting" AFTER="$waiting" check false
SEND_OK=true RESULT_URL=$URL BEFORE="$waiting" AFTER="$waiting,$waiting" check false
# Waiting first and publishing both progress messages after the send.
SEND_OK=true RESULT_URL=$URL BEFORE="" AFTER="$done_,$done_" check false
# A URL built from the input instead of read from the message.
SEND_OK=true RESULT_URL="https://example.com/posts/$post_id" BEFORE="$waiting" AFTER="$waiting,$guessed" check false
printf '%s\n' 'await ctx.step("wait", poll);' >"$SANDBOX_DIR/volcano/functions/publish-post/index.js"
SEND_OK=true RESULT_URL=$URL BEFORE="$waiting" AFTER="$waiting,$done_" check false
