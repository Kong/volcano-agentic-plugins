# shellcheck shell=bash
# desc: build a blog (posts + comments) -> foreign-key relationship + query-by-FK round-trip
#
# Broadens DB coverage past the single-table todo scenario into multi-table
# relational schemas: foreign keys, referential integrity, and querying children
# by their parent FK (the Volcano query builder is single-table, so relational
# apps link records this way rather than with join embeds). Watches for FK/
# constraint handling in one-statement-per-file migrations and cross-table RLS.
SCENARIO_PROMPT="Build a blog API with Volcano where users can publish posts and comment on posts."
SCENARIO_TIMEOUT=800

scenario_setup() { eval_reset_local_stack; }

# Independent verification: discover a FK between two app tables, then confirm a
# parent+child insert links via that FK (verify-relational.mjs). Pass = the child
# is retrievable by its parent FK.
scenario_verify() {
  local status_out api_url anon_key
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')

  # Discover a FK between two user tables (exclude FKs to auth_* owner columns) →
  # child.fk_col → parent. Local app DB is `app` on the fixed volcano-postgres container.
  local psql="docker exec volcano-postgres psql -U volcano -d app -tAF| -c"
  local fk child fk_col parent
  fk=$($psql "
    SELECT kcu.table_name, kcu.column_name, ccu.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      AND kcu.table_name NOT LIKE 'auth\_%' AND ccu.table_name NOT LIKE 'auth\_%'
    ORDER BY kcu.table_name LIMIT 1;" 2>/dev/null | head -1)
  child=$(echo "$fk" | cut -d'|' -f1); fk_col=$(echo "$fk" | cut -d'|' -f2); parent=$(echo "$fk" | cut -d'|' -f3)

  # NOT-NULL text columns without a default (must be filled on insert) per table.
  cols_for() { $psql "
    SELECT string_agg(column_name, ',')
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='$1' AND is_nullable='NO' AND column_default IS NULL
      AND data_type IN ('text','character varying');" 2>/dev/null | head -1; }
  local parent_cols child_cols out
  parent_cols=$(cols_for "$parent"); child_cols=$(cols_for "$child")

  out="{\"child_linked\":false,\"error\":\"no foreign-key relationship discovered\"}"
  if [ -n "$child" ] && [ -n "$parent" ] && [ -n "$fk_col" ] && [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    out=$(node "$SCRIPT_DIR/verify-relational.mjs" "$api_url" "$anon_key" "$parent" "$parent_cols" "$child" "$fk_col" "$child_cols" 2>"$RESULTS_DIR/verify-relational.stderr.log")
    [ -n "$out" ] || out="{\"child_linked\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/relational-roundtrip.json"

  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).child_linked?0:1)}catch{process.exit(1)}})' && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (child row retrievable by its parent foreign key)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**FK discovered:** ${child:-<none>}.${fk_col:-?} -> ${parent:-<none>}  |  round-trip: $out"
    echo; echo "See \`relational-roundtrip.json\`, \`verify-relational.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
