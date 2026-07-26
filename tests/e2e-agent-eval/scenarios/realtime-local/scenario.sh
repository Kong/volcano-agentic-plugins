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

  # Discover the app's main table and ALL its required (NOT NULL, no-default)
  # columns with types, so the verifier can fill non-text required columns too
  # (e.g. `room_id uuid NOT NULL`) instead of only text ones. Prefer a table that
  # has a text/varchar column (the chat-message content table). The local app
  # database is `app` on the fixed local `volcano-postgres` container.
  # All candidate tables (chat/message-like first), each with ALL its required
  # (NOT NULL, no-default) columns and types. The verifier tries each until one
  # delivers, so a scaffold example table (e.g. one with an unsatisfiable FK)
  # doesn't cause a false failure when the app's real table works.
  local candidates
  candidates=$(docker exec volcano-postgres psql -U volcano -d app -tAF'|' -c "
    SELECT c.table_name, string_agg(c.column_name || ':' || c.data_type, ',' ORDER BY c.ordinal_position)
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema='public' AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.is_nullable='NO' AND c.column_default IS NULL
      AND c.table_name NOT LIKE 'auth\_%'
    GROUP BY c.table_name
    HAVING bool_or(c.data_type IN ('text','character varying'))
    ORDER BY (CASE WHEN c.table_name ~* 'messag|chat' THEN 0 ELSE 1 END), c.table_name;" 2>/dev/null \
    | while IFS= read -r line; do [ -n "$line" ] && printf '%s;;' "$line"; done)

  out="{\"delivered\":false,\"error\":\"no candidate table discovered\"}"
  if [ -n "$candidates" ] && [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    out=$(node "$SCRIPT_DIR/verify-realtime.mjs" "$api_url" "$anon_key" "$candidates" 2>"$RESULTS_DIR/verify-realtime.stderr.log")
    [ -n "$out" ] || out="{\"delivered\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/realtime-roundtrip.json"
  table=$(echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).delivered_table||"")}catch{}})' 2>/dev/null)

  # Context: did the agent declare realtime enablement in config?
  local rt_declared="false"
  grep -rqsiE "^\s*realtime:" "$SANDBOX_DIR"/volcano/volcano-config.yaml "$SANDBOX_DIR"/volcano-config.yaml 2>/dev/null && rt_declared="true"

  # The prompt is "live chat app", so the generated app must actually wire the
  # realtime SDK — not just create a table and flip the backend flag. Require the
  # app source to reference the realtime client so an app that never subscribes
  # can't pass on the harness's own round-trip alone. (Full in-browser UX is left
  # to the agent's own in-run verification, out of scope for this check.)
  local app_uses_rt="false"
  grep -rqsE "VolcanoRealtime|onPostgresChanges|@volcano.dev/sdk/realtime" "$SANDBOX_DIR" \
    --include=*.js --include=*.jsx --include=*.ts --include=*.tsx \
    --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null && app_uses_rt="true"

  local delivered_ok="false"
  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).delivered?0:1)}catch{process.exit(1)}})' && delivered_ok="true"
  { [ "$delivered_ok" = "true" ] && [ "$app_uses_rt" = "true" ]; } && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (postgres-changes INSERT delivered to a subscriber AND the app wires the realtime SDK)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Table used:** ${table:-<none>}  |  **round-trip:** $out"
    echo "**App wires realtime SDK:** $app_uses_rt  |  **realtime: block in volcano-config.yaml:** $rt_declared"
    echo; echo "See \`realtime-roundtrip.json\`, \`verify-realtime.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
