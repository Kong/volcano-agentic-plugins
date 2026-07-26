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

# Independent verification: for each bucket the build created, mint a real SDK
# user and do an upload -> list round-trip (verify-storage.mjs). Pass = at least
# one bucket accepts an authenticated upload and lists it back. No bucket = fail
# (the single most likely storage mistake).
scenario_verify() {
  local status_out api_url anon_key buckets result="[]"
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')

  # Bucket names from the CLI (source of truth — config.yaml only sets policies).
  buckets="$(cd "$SANDBOX_DIR" && volcano storage bucket list 2>&1)"
  echo "$buckets" >"$RESULTS_DIR/buckets.txt"
  # A bucket row is a name token on a listing line; skip header/blank lines.
  local names; names=$(echo "$buckets" | awk 'NR>1 && $1 !~ /^-|^Name|^Showing|^Total:|^$/ {print $1}' | sort -u)

  : >"$RESULTS_DIR/storage-roundtrip.jsonl"
  local any_pass="false" b
  if [ -n "$names" ] && [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    for b in $names; do
      local out; out=$(node "$SCRIPT_DIR/verify-storage.mjs" "$api_url" "$anon_key" "$b" 2>>"$RESULTS_DIR/verify-storage.stderr.log")
      echo "$out" >>"$RESULTS_DIR/storage-roundtrip.jsonl"
      echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);process.exit(r.uploaded&&r.listed?0:1)}catch{process.exit(1)}})' && any_pass="true"
    done
  fi
  [ "$any_pass" = "true" ] && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (>=1 bucket accepted an authenticated upload + list round-trip)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Buckets found:** $(echo "$names" | tr '\n' ' ')"
    echo; echo "See \`buckets.txt\`, \`storage-roundtrip.jsonl\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
