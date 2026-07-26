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

# Independent verification: discover every FK between app tables (with the
# referenced column) and each table's required columns, then confirm a
# parent+child insert links via a FK and the child is queryable by it
# (verify-relational.mjs). Pass = the just-inserted child is retrievable by its
# parent FK on at least one edge (post->comment edge tried first).
scenario_verify() {
  local status_out api_url anon_key
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')
  local psql="docker exec volcano-postgres psql -U volcano -d app -tAF| -c"

  # All FK edges between user tables: child|fkCol|parent|refCol (the referenced
  # parent column, not an assumed id). Order the blog edge (comment->post) first,
  # then any FK targeting a post, then the rest; the verifier tries each in turn.
  $psql "
    SELECT kcu.table_name || '|' || kcu.column_name || '|' || ccu.table_name || '|' || ccu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      AND kcu.table_name NOT LIKE 'auth\_%' AND ccu.table_name NOT LIKE 'auth\_%'
    ORDER BY (CASE WHEN kcu.table_name ~* 'comment' AND ccu.table_name ~* 'post' THEN 0
                   WHEN ccu.table_name ~* 'post' THEN 1 ELSE 2 END), kcu.table_name;" 2>/dev/null \
    | grep -v '^$' >"$RESULTS_DIR/fks.txt"

  # Every required (NOT NULL, no-default) column with its type, all tables:
  # table|col|type. The verifier synthesizes type-appropriate values for each.
  $psql "
    SELECT table_name || '|' || column_name || '|' || data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND is_nullable='NO' AND column_default IS NULL
      AND table_name NOT LIKE 'auth\_%';" 2>/dev/null | grep -v '^$' >"$RESULTS_DIR/cols.txt"

  local out="{\"child_linked\":false,\"error\":\"no foreign-key relationship discovered\"}"
  if [ -s "$RESULTS_DIR/fks.txt" ] && [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    out=$(node "$SCRIPT_DIR/verify-relational.mjs" "$api_url" "$anon_key" "$RESULTS_DIR/fks.txt" "$RESULTS_DIR/cols.txt" 2>"$RESULTS_DIR/verify-relational.stderr.log")
    [ -n "$out" ] || out="{\"child_linked\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/relational-roundtrip.json"

  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).child_linked?0:1)}catch{process.exit(1)}})' && PASS="true"

  local edge; edge=$(echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.linked_edge||(j.edges&&j.edges[0]&&j.edges[0].edge)||"")}catch{}})' 2>/dev/null)
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (just-inserted child retrievable by its parent foreign key)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**FK edge linked:** ${edge:-<none>}  |  FKs discovered: $(wc -l <"$RESULTS_DIR/fks.txt" | tr -d ' ')"
    echo "round-trip: $out"
    echo; echo "See \`relational-roundtrip.json\`, \`fks.txt\`, \`cols.txt\`, \`verify-relational.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
