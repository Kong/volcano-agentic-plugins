# shellcheck shell=bash
# desc: build a live chat app -> realtime enablement + postgres-changes delivery round-trip
#
# Broadens coverage into the volcano-realtime skill / SDK realtime path. Known
# thrash risks: realtime is disabled by default (enable via `realtime: { enabled:
# true }` in volcano-config.yaml + config deploy), the postgres channel name must
# be schema:table, and handlers must be registered before subscribe(). Verifies
# the full DB->realtime pipeline (needs hosting VOL-521 + SDK >=1.4.1 VOL-522).
SCENARIO_PROMPT="Build a live chat app with Volcano where messages appear in real time as they are sent."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Independent verification: an authenticated postgres-changes round-trip on the
# app's main table (verify-realtime.mjs). Pass = the INSERT is delivered to a
# realtime subscriber, which requires the agent to have (a) created a table,
# (b) enabled realtime, and the whole DB->client pipeline to work.
scenario_verify() {
  local status_out api_url anon_key table cols out
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')

  # Discover the app's main table + its NOT-NULL text columns that lack a default
  # (the ones a bare insert must fill; id/user_id/created_at carry defaults). The
  # local app database is `app` on the fixed local `volcano-postgres` container.
  local discover
  discover=$(docker exec volcano-postgres psql -U volcano -d app -tAF'|' -c "
    SELECT c.table_name, string_agg(c.column_name, ',')
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema='public' AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.is_nullable='NO' AND c.column_default IS NULL
      AND c.data_type IN ('text','character varying')
      AND c.table_name NOT LIKE 'auth\_%'
    GROUP BY c.table_name
    ORDER BY c.table_name
    LIMIT 1;" 2>/dev/null | head -1)
  table=${discover%%|*}; cols=${discover#*|}

  out="{\"delivered\":false,\"error\":\"no table discovered\"}"
  if [ -n "$table" ] && [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    out=$(node "$SCRIPT_DIR/verify-realtime.mjs" "$api_url" "$anon_key" "$table" "$cols" 2>"$RESULTS_DIR/verify-realtime.stderr.log")
    [ -n "$out" ] || out="{\"delivered\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/realtime-roundtrip.json"

  # Context: did the agent declare realtime enablement in config?
  local rt_declared="false"
  grep -rqsiE "^\s*realtime:" "$SANDBOX_DIR"/volcano/volcano-config.yaml "$SANDBOX_DIR"/volcano-config.yaml 2>/dev/null && rt_declared="true"

  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).delivered?0:1)}catch{process.exit(1)}})' && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (authenticated postgres-changes INSERT delivered to a realtime subscriber)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Table used:** ${table:-<none>}  |  **round-trip:** $out"
    echo "**realtime: block in volcano-config.yaml:** $rt_declared"
    echo; echo "See \`realtime-roundtrip.json\`, \`verify-realtime.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
