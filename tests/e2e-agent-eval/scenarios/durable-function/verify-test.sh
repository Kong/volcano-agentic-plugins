#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
source "$(dirname "$0")/scenario.sh"
SANDBOX_DIR=$(mktemp -d)
RESULTS_DIR=$(mktemp -d)
trap 'rm -rf "$SANDBOX_DIR" "$RESULTS_DIR"' EXIT
SCENARIO=durable-function RUN_ID=test AGENT_EXIT=0 AGENT_WALL_S=1
mkdir -p "$SANDBOX_DIR/volcano/functions/double-number"
printf '%s\n' 'await ctx.step("double", fn); await ctx.step("add", fn);' >"$SANDBOX_DIR/volcano/functions/double-number/index.js"
volcano() {
  case "$*" in
    'durable get double-number') printf 'Status: active\n' ;;
    'durable start double-number --input '* ) printf 'ID: 11111111-1111-4111-8111-111111111111\n' ;;
    'durable executions get double-number '* ) printf 'Status: succeeded\nResult: {\n  "value": %s\n}\n' "$EXPECTED" ;;
    *) return 1 ;;
  esac
}
# Fix the random input so the mock can return the matching value.
RANDOM=1234
number=$RANDOM
EXPECTED=$(( (10000 + number) * 2 + 1 ))
RANDOM=1234
PASS=false
scenario_verify
[ "$PASS" = true ]
EXPECTED=0
RANDOM=1234
PASS=false
scenario_verify
[ "$PASS" = false ]
