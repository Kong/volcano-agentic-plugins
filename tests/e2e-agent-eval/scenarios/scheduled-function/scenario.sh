# shellcheck shell=bash
# desc: build a cron-scheduled function that writes to the DB -> schedule registers + fires
#
# Broadens coverage into the volcano-functions schedulers surface (cron), which
# no other scenario touches. Verifies the whole chain: the agent deploys a
# function, declares a scheduler (functions[].schedulers[].cron in
# volcano-config.yaml) and config-deploys it, and the local scheduler ticker
# (claims due jobs ~every 15s) actually fires it. Watches for cron/schedule
# config friction and whether a scheduled (credential-free) function can write.
SCENARIO_PROMPT="Build a Volcano scheduled function that runs every minute and inserts a heartbeat row (a timestamped log entry) into a database table."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Independent verification: after the agent finishes, poll the app DB's insert
# counter during a quiet wait. Nothing else writes now, so a row appearing means
# the schedule fired the function and it wrote — the real end-to-end signal.
# An every-minute cron fires within ~75s (local ticker granularity ~15s).
scenario_verify() {
  local psql="docker exec volcano-postgres psql -U volcano -d app -tAc"

  # Context: is a scheduler declared in config, and what does the CLI list show?
  local sched_declared="false"
  grep -rqsiE "schedulers:|cron:" "$SANDBOX_DIR"/volcano/volcano-config.yaml "$SANDBOX_DIR"/volcano-config.yaml 2>/dev/null && sched_declared="true"
  : >"$RESULTS_DIR/schedulers.txt"
  if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
    local fn
    for fn in $(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u); do
      echo "### $fn" >>"$RESULTS_DIR/schedulers.txt"
      (cd "$SANDBOX_DIR" && volcano functions schedulers list "$fn" 2>&1) >>"$RESULTS_DIR/schedulers.txt"
    done
  fi

  local q="SELECT COALESCE(SUM(n_tup_ins),0) FROM pg_stat_user_tables WHERE schemaname='public' AND relname NOT LIKE 'auth\\_%';"
  local before after delta=0
  before=$($psql "$q" 2>/dev/null | tr -d '[:space:]'); before=${before:-0}
  after=$before
  local i
  for i in $(seq 1 7); do        # up to ~140s
    sleep 20
    after=$($psql "$q" 2>/dev/null | tr -d '[:space:]'); after=${after:-0}
    delta=$(( after - before ))
    [ "$delta" -gt 0 ] && break
  done
  [ "$delta" -gt 0 ] && PASS="true"

  echo "{\"scheduler_declared\":$sched_declared,\"inserts_before\":$before,\"inserts_after\":$after,\"delta\":$delta,\"fired\":$([ "$delta" -gt 0 ] && echo true || echo false)}" >"$RESULTS_DIR/scheduled-result.json"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (a scheduled run inserted a row during a quiet wait)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**scheduler declared in config:** $sched_declared"
    echo "**app-DB inserts during wait:** $before -> $after (delta $delta)"
    echo; echo "See \`schedulers.txt\`, \`scheduled-result.json\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
