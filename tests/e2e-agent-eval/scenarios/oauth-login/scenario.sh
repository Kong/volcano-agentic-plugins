# shellcheck shell=bash
# desc: build a Google OAuth sign-in web app -> provider configured + app builds (+ authorize redirect)
#
# Broadens coverage into the volcano-auth OAuth / social-login path (email+password
# is covered by todo-api-local). A real provider login can't be driven headlessly,
# so this verifies the parts the agent controls: it configured a Google provider
# (auth_oauth_configs), the Next.js app builds with the OAuth wiring, and the
# authorize endpoint redirects to the provider. Placeholder credentials are given
# so the run isn't blocked on real Google creds; the friction under test is the
# provider config + callback wiring.
SCENARIO_PROMPT="Build a web app where users sign in with Google using Volcano OAuth. Use these placeholder Google OAuth credentials: client ID 'test-google-client-id' and client secret 'test-google-client-secret'."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

scenario_verify() {
  local status_out api_url anon_key
  status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
  api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
  anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')

  # 1) The EXACT requested provider config: google, the placeholder client_id, enabled.
  #    (platform DB = volcano). A stale/disabled/wrong-id row must not pass.
  local provider_cfg provider_ok="false"
  provider_cfg=$(docker exec volcano-postgres psql -U volcano -d volcano -tAF'|' -c \
    "SELECT provider, client_id, enabled FROM auth_oauth_configs WHERE provider='google' AND client_id='test-google-client-id' AND enabled LIMIT 1;" 2>/dev/null | head -1)
  [ -n "$provider_cfg" ] && provider_ok="true"

  # 2) The authorize endpoint must redirect to Google AND carry the configured
  #    client_id (both required — a Google URL with the wrong creds isn't valid).
  local authloc="" authorize_ok="false"
  if [ -n "$anon_key" ]; then
    authloc=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 8 \
      "http://localhost:8000/auth/oauth/google/authorize?anon_key=${anon_key}&redirect_url=http://localhost:3000/auth/callback" 2>/dev/null)
  fi
  if echo "$authloc" | grep -qi "accounts\.google\.com" && echo "$authloc" | grep -qi "client_id=test-google-client-id"; then
    authorize_ok="true"
  fi

  # 3) The app must be a real Volcano OAuth app that builds: next + @volcano.dev/sdk
  #    deps (a plain Next.js app is not the signal) AND actual OAuth wiring in source.
  local pkg app_dir build_ok="false" oauth_wired="false"
  pkg=$(find "$SANDBOX_DIR" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null | while read -r f; do
    node -e 'const p=require(process.argv[1]);const d={...p.dependencies,...p.devDependencies};process.exit(d.next&&d["@volcano.dev/sdk"]?0:1)' "$f" 2>/dev/null && { echo "$f"; break; }
  done)
  app_dir=${pkg:+$(dirname "$pkg")}
  if [ -n "$app_dir" ]; then
    grep -rqiE "signInWithOAuth|/auth/oauth/" "$app_dir" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' 2>/dev/null && oauth_wired="true"
    ( cd "$app_dir"; [ -d node_modules ] || timeout 300 npm install >"$RESULTS_DIR/next-install.log" 2>&1
      timeout 300 npm run build >"$RESULTS_DIR/next-build.log" 2>&1 ) && build_ok="true"
  fi

  node -e 'const [p,ao,al,ab,ow]=process.argv.slice(1);process.stdout.write(JSON.stringify({provider_configured:p,authorize_ok:ao==="true",authorize_redirect:al,app_builds:ab==="true",oauth_wired:ow==="true"}))' \
    "$provider_cfg" "$authorize_ok" "$authloc" "$build_ok" "$oauth_wired" >"$RESULTS_DIR/oauth-result.json"

  # Pass requires the full OAuth chain: exact enabled provider + a real redirect
  # carrying it + a Volcano OAuth app that builds with wiring present.
  { [ "$provider_ok" = "true" ] && [ "$authorize_ok" = "true" ] && [ "$build_ok" = "true" ] && [ "$oauth_wired" = "true" ]; } && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (exact Google provider enabled AND authorize redirects with it AND the Volcano OAuth app builds)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Provider (auth_oauth_configs):** ${provider_cfg:-<none>}"
    echo "**App builds:** $build_ok (oauth wiring: $oauth_wired)  |  **authorize redirect OK:** $authorize_ok"
    echo "**authorize Location:** ${authloc:-<none>}"
    echo; echo "See \`oauth-result.json\`, \`next-build.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
