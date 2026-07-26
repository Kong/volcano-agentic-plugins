# shellcheck shell=bash
# desc: bare "build a todo app" -> auto local deploy -> authenticated invoke round-trip
#
# The canonical Phase-1 scenario. A bare, product-named prompt (no "and deploy
# it") checks that the agent follows AGENTS.md's build -> auto-local-deploy
# default. "app" over "API" keeps it realistic; the verifier still requires an
# invokable Function to exist.
SCENARIO_PROMPT="Build a todo app using volcano."
SCENARIO_TIMEOUT=600

# Hand the agent a freshly-reset, STOPPED local stack so we can also tell
# whether it runs `volcano start` itself.
scenario_setup() { eval_reset_local_stack; }

# Independent verification (harness-run, not agent-run): discover the deployed
# functions from the scaffold and invoke one through a real authenticated SDK
# session. `volcano functions invoke` can't supply a bearer token and a
# correctly-secured function 401s without one, so we mint a session via the SDK
# (invoke-with-auth.mjs). Pass = >=1 function returns 2xx with a parseable JSON
# body.
scenario_verify() {
  local verify_json="$RESULTS_DIR/verification.json"

  if [ ! -d "$SANDBOX_DIR/volcano" ]; then
    echo '{"volcano_dir_present": false, "local_stack_up": false, "functions_list_raw": "", "auth_error": null, "invocations": []}' >"$verify_json"
  else
    local status_out local_up functions_out fn_names auth_result api_url anon_key
    status_out="$(cd "$SANDBOX_DIR" && volcano status 2>&1)"
    local_up=$(echo "$status_out" | grep -qi "running" && echo true || echo false)
    functions_out="$(cd "$SANDBOX_DIR" && volcano functions list 2>&1)"

    # Discover names from disk (volcano/functions/ maps 1:1 to function names;
    # `_`-prefixed entries are shared code), not the CLI's table, which
    # truncates long names with `...`.
    fn_names=""
    if [ -d "$SANDBOX_DIR/volcano/functions" ]; then
      fn_names=$(find "$SANDBOX_DIR/volcano/functions" -mindepth 1 -maxdepth 1 -not -name '_*' -exec basename {} \; | sed 's/\.[^.]*$//' | sort -u)
    fi

    auth_result='{"auth_error": null, "invocations": []}'
    if [ -n "$fn_names" ]; then
      api_url=$(echo "$status_out" | grep "API URL:" | awk '{print $NF}')
      anon_key=$(echo "$status_out" | grep "Anon Key:" | awk '{print $NF}')
      if [ -n "$api_url" ] && [ -n "$anon_key" ]; then
        # shellcheck disable=SC2086
        auth_result=$(node "$SCRIPT_DIR/invoke-with-auth.mjs" "$api_url" "$anon_key" $fn_names 2>"$RESULTS_DIR/invoke-with-auth.stderr.log")
        [ -n "$auth_result" ] || auth_result='{"auth_error": "invoke-with-auth.mjs produced no output — see invoke-with-auth.stderr.log", "invocations": []}'
      else
        auth_result='{"auth_error": "could not read API URL/anon key from volcano status", "invocations": []}'
      fi
    fi

    node -e '
      const [up, functionsListRaw, authResultJson] = process.argv.slice(1);
      const a = JSON.parse(authResultJson);
      process.stdout.write(JSON.stringify({
        volcano_dir_present: true, local_stack_up: up === "true",
        functions_list_raw: functionsListRaw, auth_error: a.auth_error, invocations: a.invocations,
      }, null, 2) + "\n");
    ' "$local_up" "$functions_out" "$auth_result" >"$verify_json"
  fi

  if node -e '
    const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const isJson = (d) => (d !== null && typeof d === "object") || (typeof d === "string" && (() => { try { JSON.parse(d); return true; } catch { return false; } })());
    process.exit((v.invocations || []).some((i) => !i.error && i.status >= 200 && i.status < 300 && isJson(i.data)) ? 0 : 1);
  ' "$verify_json"; then PASS="true"; fi

  local auth_note; auth_note=$(node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(v.auth_error)process.stdout.write(v.auth_error);' "$verify_json" 2>/dev/null || true)
  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (>=1 deployed function invoked successfully, authenticated)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    [ -n "$auth_note" ] && { echo; echo "**Note:** a non-pass may be a harness verification problem, not a build failure — auth_error: $auth_note"; }
    echo; echo "See \`metrics.json\` for friction signals and \`verification.json\` for the invoke results."
  } >"$RESULTS_DIR/report.md"
}
