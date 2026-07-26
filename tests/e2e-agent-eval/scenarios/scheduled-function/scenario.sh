# shellcheck shell=bash
# desc: build a cron-scheduled function that writes to the DB -> schedule registers + fires
#
# Broadens coverage into the volcano-functions schedulers surface (cron), which
# no other scenario touches. Verifies the whole chain: the agent deploys a
# function, declares a scheduler (functions[].schedulers[].cron in
# volcano-config.yaml) and config-deploys it, and the local scheduler ticker
# (claims due jobs ~every 15s) actually fires it. Watches for cron/schedule
# config friction and whether a scheduled (credential-free) function can write.
SCENARIO_PROMPT="Build a Volcano scheduled function that runs every minute and inserts a heartbeat row (a timestamped log entry) into a database table named 'heartbeats'."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Independent verification: after the agent finishes, count COMMITTED rows in the
# pinned `heartbeats` table during a quiet wait. count(*) (not pg_stat n_tup_ins,
# which also counts rolled-back inserts) rising while nothing else writes means
# the schedule fired the function and it committed a row. Also require a scheduler
# to actually be REGISTERED (CLI output) so a stray writer or a non-scheduler
# mechanism can't pass. An every-minute cron fires within ~75s (ticker ~15s).
scenario_verify() {
  local psql="docker exec volcano-postgres psql -U volcano -d app -tAc"

  # Is a scheduler declared in config, and does the CLI show it registered?
  local sched_declared="false" sched_registered="false"
  grep -rqsiE "schedulers:|cron:" "$SANDBOX_DIR"/volcano/volcano-config.yaml "$SANDBOX_DIR"/volcano-config.yaml 2>/dev/null && sched_declared="true"
  : >"$RESULTS_DIR/schedulers.txt"
  if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
    local fn
    for fn in $(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u); do
      echo "### $fn" >>"$RESULTS_DIR/schedulers.txt"
      (cd "$SANDBOX_DIR" && volcano functions schedulers list "$fn" 2>&1) >>"$RESULTS_DIR/schedulers.txt"
    done
  fi
  # A registered scheduler shows a cron expression / run timestamps in the CLI
  # output; "no schedulers" headers won't match these.
  grep -qiE "\*[[:space:]]+\*|last run|next run|@(minutely|hourly|daily)" "$RESULTS_DIR/schedulers.txt" && sched_registered="true"

  # Committed heartbeat rows. A failed baseline query (table missing / DB down)
  # must NOT be coerced to 0 and then read as a huge cumulative delta later — it
  # fails closed as inconclusive instead.
  local q="SELECT count(*) FROM heartbeats;"
  local before after delta=0 baseline_ok="true"
  before=$($psql "$q" 2>/dev/null | tr -d '[:space:]')
  case "$before" in ''|*[!0-9]*) baseline_ok="false"; before=0 ;; esac
  after=$before
  if [ "$baseline_ok" = "true" ]; then
    local i
    for i in $(seq 1 7); do       # up to ~140s
      sleep 20
      after=$($psql "$q" 2>/dev/null | tr -d '[:space:]')
      case "$after" in ''|*[!0-9]*) after=$before ;; esac
      delta=$(( after - before ))
      [ "$delta" -gt 0 ] && break
    done
  fi

  # Pass = a scheduler is registered AND a committed heartbeat row appeared during
  # the quiet wait (attributes the write to the scheduled fire).
  { [ "$sched_registered" = "true" ] && [ "$baseline_ok" = "true" ] && [ "$delta" -gt 0 ]; } && PASS="true"

  echo "{\"scheduler_declared\":$sched_declared,\"scheduler_registered\":$sched_registered,\"baseline_ok\":$baseline_ok,\"heartbeats_before\":$before,\"heartbeats_after\":$after,\"delta\":$delta,\"fired\":$([ "$delta" -gt 0 ] && echo true || echo false)}" >"$RESULTS_DIR/scheduled-result.json"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (scheduler registered AND a committed heartbeat row appeared during a quiet wait)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**scheduler declared in config:** $sched_declared  |  **registered (CLI):** $sched_registered"
    echo "**heartbeats rows during wait:** $before -> $after (delta $delta, baseline_ok $baseline_ok)"
    echo; echo "See \`schedulers.txt\`, \`scheduled-result.json\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
