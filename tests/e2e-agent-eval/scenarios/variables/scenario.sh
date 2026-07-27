# shellcheck shell=bash
# desc: build a function that consumes a project variable -> variable set correctly + read at runtime
#
# Broadens coverage into the project-variables lifecycle, which no other scenario
# touches: declare a variable, DEPLOY it (a step separate from `functions deploy`
# — `volcano variables deploy` from volcano/volcano.env, or a `variables:` block
# + `config deploy`), and CONSUME it in a function via process.env. The common
# failure this catches: the agent deploys the function but forgets to deploy the
# variable, so process.env.<VAR> is undefined at runtime. The mechanism is
# identical for secrets (STRIPE_SECRET_KEY, etc.) — we use a non-secret prefix so
# the runtime signal can be returned without echoing a secret.
SCENARIO_PROMPT="Build a Volcano function named 'greet' that returns a greeting string. Configure a project variable named GREETING_PREFIX with the value 'Volcano says hello to'. The function takes a 'name' from the request and returns the greeting '<GREETING_PREFIX> <name>', where the prefix is read from the project variable (not hardcoded) and the name comes from the request."
SCENARIO_TIMEOUT=900

EXPECTED_VAR="GREETING_PREFIX"
EXPECTED_PREFIX="Volcano says hello to"

scenario_setup() { eval_reset_local_stack; }

# Independent verification, two signals:
#  1) SET CORRECTLY — the `variables` table (platform DB, plaintext value) has
#     GREETING_PREFIX == the expected value. Proves the deploy step happened.
#  2) CONSUMED PROPERLY — invoking the function with a random name returns the
#     prefix + that name, proving the function read process.env.<VAR> at runtime.
scenario_verify() {
  local status_out api_url anon_key
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')

  local fn=""
  if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
    fn=$(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u | head -1)
  fi

  # 1) Variable set correctly? The variables table lives in the platform DB
  #    (values stored in the clear); fall back to `app` if the layout differs.
  local db_val="" var_set="false" q="SELECT value FROM variables WHERE name='${EXPECTED_VAR}' LIMIT 1;"
  db_val=$(docker exec volcano-postgres psql -U volcano -d volcano -tAc "$q" 2>/dev/null | head -1)
  [ -n "$db_val" ] || db_val=$(docker exec volcano-postgres psql -U volcano -d app -tAc "$q" 2>/dev/null | head -1)
  [ "$db_val" = "$EXPECTED_PREFIX" ] && var_set="true"

  # 2) Consumed at runtime? Random name defeats a hardcoded response.
  local rand="Ada-$RANDOM$RANDOM"
  local out="{\"invoked\":false,\"consumed\":false,\"error\":\"no api url/anon key\"}"
  if [ -n "$api_url" ] && [ -n "$anon_key" ]; then
    out=$(node "$SCRIPT_DIR/verify-variables.mjs" "$api_url" "$anon_key" "$fn" "$EXPECTED_PREFIX" "$rand" 2>"$RESULTS_DIR/verify-variables.stderr.log")
    [ -n "$out" ] || out="{\"invoked\":false,\"consumed\":false,\"error\":\"verifier produced no output\"}"
  fi
  echo "$out" >"$RESULTS_DIR/variables-result.json"

  # Pass = variable set correctly AND consumed at runtime (invoke 2xx + prefix+name in reply).
  local consumed_ok
  consumed_ok=$(echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);const ok=r.invoke_status>=200&&r.invoke_status<300;process.stdout.write((ok&&r.consumed)?"true":"false")}catch{process.stdout.write("false")}})')
  { [ "$var_set" = "true" ] && [ "$consumed_ok" = "true" ]; } && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (variable set correctly in the platform AND consumed by the function at runtime)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Function:** ${fn:-<none>}"
    echo "**${EXPECTED_VAR} in variables table:** ${db_val:-<unset>} (set_correctly: $var_set)"
    echo "**Runtime:** $out"
    echo; echo "See \`variables-result.json\`, \`verify-variables.stderr.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
