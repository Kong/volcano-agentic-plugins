# shellcheck shell=bash
# desc: build a QR-code generator function (npm-bundled + binary) that stores to a bucket
#
# Exercises the last untested friction surface: a server function that bundles a
# real npm dependency (Model B / esbuild `build:functions`) and produces binary
# output, combined with storage. The platform skill hedges heavily around function
# packaging (commit built output, run build:functions before deploy, packaging
# edge cases) precisely because it trips agents up — this checks it end to end.
SCENARIO_PROMPT="Build a Volcano function that generates a QR code (PNG image) for a given URL and stores the PNG in a storage bucket. It should accept a url and return where the QR code was stored."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Independent verification: discover the deployed function + buckets, invoke the
# function with a URL, and confirm a real PNG was produced — in the response or
# written to a bucket (magic-byte check). Pass = the invoke succeeded AND a valid
# QR PNG exists somewhere.
scenario_verify() {
  local status_out api_url anon_key project_id
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')
  project_id=$(echo "$status_out" | grep "Project ID:" | awk '{print $NF}')

  # Deployed function names (volcano/functions/ maps 1:1; _-prefixed are shared).
  local fn=""
  if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
    fn=$(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u | head -1)
  fi

  # Buckets are discovered inside the verifier from the local admin API
  # (untruncated names); the CLI `bucket list` table truncates to 32 chars.
  local out="{\"invoked\":false,\"png_in_response\":false,\"png_in_storage\":false,\"error\":\"no api url/anon key\"}"
  if [ -n "$api_url" ] && [ -n "$anon_key" ] && [ -n "$project_id" ]; then
    out=$(node "$SCRIPT_DIR/verify-generator.mjs" "$api_url" "$anon_key" "$project_id" "$fn" 2>"$RESULTS_DIR/verify-generator.stderr.log")
    [ -n "$out" ] || out="{\"invoked\":false,\"png_in_response\":false,\"png_in_storage\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/generator-result.json"

  # Pass = the invoke succeeded (2xx) AND a valid QR PNG exists (response or storage).
  # Gating on invoke_status stops a stray PNG left in a bucket from passing a
  # broken/absent function.
  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);const ok=r.invoke_status>=200&&r.invoke_status<300;process.exit((ok&&(r.png_in_response||r.png_in_storage))?0:1)}catch{process.exit(1)}})' && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (invoke returned 2xx AND a valid QR PNG exists — in the response or in storage)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Function:** ${fn:-<none>}"
    echo "**Result:** $out"
    echo; echo "See \`generator-result.json\`, \`verify-generator.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
