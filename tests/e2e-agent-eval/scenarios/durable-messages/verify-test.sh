#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
source "$(dirname "$0")/scenario.sh"
SANDBOX_DIR=$(mktemp -d)
RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$SANDBOX_DIR" "$RESULTS_DIR"' EXIT
SCENARIO=durable-messages RUN_ID=test AGENT_EXIT=0 AGENT_WALL_S=1
mkdir -p "$SANDBOX_DIR/volcano/functions/publish-post"
printf '%s\n' 'await ctx.publish("progress", {}); await ctx.waitForMessage("posted", { timeout: "1h" });' \
  >"$SANDBOX_DIR/volcano/functions/publish-post/index.js"
volcano() {
  case "$*" in
    'durable get publish-post') printf 'Status: active\n' ;;
    'durable start publish-post --input '* ) printf 'ID: 11111111-1111-4111-8111-111111111111\n' ;;
    'durable messages send publish-post '* ) [ "$SEND_OK" = true ] ;;
    'durable executions get publish-post '* ) printf 'Status: succeeded\nResult: {\n  "url": "%s"\n}\n' "$RESULT_URL" ;;
    'durable messages list publish-post '*'--direction out --json')
      printf '{"data":[%s],"has_more":false}\n' "$PUBLISHED" ;;
    *) return 1 ;;
  esac
}
# Fix the random input so the mock can return the matching URL.
RANDOM=1234
post_id=$(( 10000 + RANDOM ))
URL="https://example.com/posts/$post_id"
waiting='{"name":"progress","data":{"stage":"waiting"}}'
done_='{"name":"progress","data":{"url":"'"$URL"'"}}'

check() {
  RANDOM=1234
  PASS=false
  scenario_verify
  [ "$PASS" = "$1" ]
}

SEND_OK=true RESULT_URL=$URL PUBLISHED="$waiting,$done_" check true
SEND_OK=false RESULT_URL=$URL PUBLISHED="$waiting,$done_" check false
SEND_OK=true RESULT_URL=https://example.com/other PUBLISHED="$waiting,$done_" check false
SEND_OK=true RESULT_URL=$URL PUBLISHED="$waiting" check false
SEND_OK=true RESULT_URL=$URL PUBLISHED="$waiting,$waiting" check false
printf '%s\n' 'await ctx.step("wait", poll);' >"$SANDBOX_DIR/volcano/functions/publish-post/index.js"
SEND_OK=true RESULT_URL=$URL PUBLISHED="$waiting,$done_" check false
