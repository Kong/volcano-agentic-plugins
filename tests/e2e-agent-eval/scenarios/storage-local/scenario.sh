# shellcheck shell=bash
# desc: build a file upload+list app -> auto local deploy -> storage round-trip
#
# Broadens coverage past functions/DB/auth into the storage skill. Watches for
# the known gotchas: buckets must be created via CLI first
# (`volcano storage bucket create`), and `volcano-config.yaml`'s buckets section
# only manages policies — it never creates a bucket. An agent that expects
# config to create the bucket, or forgets to create one, fails the round-trip.
SCENARIO_PROMPT="Build an app where users can upload files and list their own uploaded files, using Volcano."
SCENARIO_TIMEOUT=700

scenario_setup() { eval_reset_local_stack; }

# Independent verification: verify-storage.mjs discovers every bucket the build
# created from the local admin API (untruncated names + each bucket's
# allowed_mime_types — the CLI `bucket list` table truncates names to 32 chars),
# mints a real SDK user, and does an upload -> list round-trip per bucket using
# a MIME type that bucket allows. Pass = >=1 bucket accepts an authenticated
# upload and lists it back. No bucket = fail (the single most likely mistake).
scenario_verify() {
  local status_out api_url anon_key project_id
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')
  project_id=$(echo "$status_out" | grep "Project ID:" | awk '{print $NF}')

  # Human artifact only (names truncated in this table — not used for logic).
  (cd "$SANDBOX_DIR" && volcano storage bucket list) >"$RESULTS_DIR/buckets.txt" 2>&1

  : >"$RESULTS_DIR/storage-roundtrip.jsonl"
  if [ -n "$api_url" ] && [ -n "$anon_key" ] && [ -n "$project_id" ]; then
    if node "$SCRIPT_DIR/verify-storage.mjs" "$api_url" "$anon_key" "$project_id" \
         >"$RESULTS_DIR/storage-roundtrip.jsonl" 2>>"$RESULTS_DIR/verify-storage.stderr.log"; then
      PASS="true"
    fi
  fi

  local names; names=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=s.trim().split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l).bucket}catch{return null}}).filter(Boolean);process.stdout.write(n.join(" "))})' <"$RESULTS_DIR/storage-roundtrip.jsonl" 2>/dev/null)

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (>=1 bucket accepted an authenticated upload + list round-trip)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Buckets tested:** ${names:-none}"
    echo; echo "See \`buckets.txt\`, \`storage-roundtrip.jsonl\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
