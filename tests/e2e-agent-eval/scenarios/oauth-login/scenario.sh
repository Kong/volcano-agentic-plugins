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

  # 1) Did the agent configure a Google OAuth provider? (platform DB = volcano)
  local provider_cfg
  provider_cfg=$(docker exec volcano-postgres psql -U volcano -d volcano -tAF'|' -c \
    "SELECT provider, client_id, enabled FROM auth_oauth_configs WHERE provider='google' LIMIT 1;" 2>/dev/null | head -1)

  # 2) Does the authorize endpoint redirect to the provider? (bonus signal)
  local authloc="" authorize_ok="false"
  if [ -n "$anon_key" ]; then
    authloc=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 8 \
      "http://localhost:8000/auth/oauth/google/authorize?anon_key=${anon_key}&redirect_url=http://localhost:3000/auth/callback" 2>/dev/null)
  fi
  echo "$authloc" | grep -qiE "accounts\.google\.com|client_id=test-google-client-id" && authorize_ok="true"

  # 3) Does the Next.js app build (OAuth wiring compiles)?
  local pkg app_dir build_ok="false"
  pkg=$(find "$SANDBOX_DIR" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null | while read -r f; do
    node -e 'const p=require(process.argv[1]);process.exit((p.dependencies&&p.dependencies.next)||(p.devDependencies&&p.devDependencies.next)?0:1)' "$f" 2>/dev/null && { echo "$f"; break; }
  done)
  app_dir=${pkg:+$(dirname "$pkg")}
  if [ -n "$app_dir" ]; then
    ( cd "$app_dir"; [ -d node_modules ] || timeout 300 npm install >"$RESULTS_DIR/next-install.log" 2>&1
      timeout 300 npm run build >"$RESULTS_DIR/next-build.log" 2>&1 ) && build_ok="true"
  fi

  echo "{\"provider_configured\":\"${provider_cfg}\",\"authorize_ok\":${authorize_ok},\"authorize_redirect\":\"${authloc}\",\"app_builds\":${build_ok}}" >"$RESULTS_DIR/oauth-result.json"
  { [ -n "$provider_cfg" ] && [ "$build_ok" = "true" ]; } && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (Google provider configured AND the OAuth app builds)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**Provider (auth_oauth_configs):** ${provider_cfg:-<none>}"
    echo "**App builds:** $build_ok  |  **authorize redirect OK:** $authorize_ok"
    echo "**authorize Location:** ${authloc:-<none>}"
    echo; echo "See \`oauth-result.json\`, \`next-build.log\`, and \`metrics.json\`."
  } >"$RESULTS_DIR/report.md"
}
