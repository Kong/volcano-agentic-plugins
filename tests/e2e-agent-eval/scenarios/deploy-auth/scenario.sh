# shellcheck shell=bash
# desc: unauthenticated "deploy to cloud" -> detect auth need -> background login + float the code
#
# PRECONDITION: a Volcano hosting server reachable at $CLAUDE_EVAL_CLOUD_API_URL
# (default http://localhost:8000, e.g. a `make dev` instance) that serves the
# auth/device flow. This checks the agent's auth-detection + login-floating
# behavior (skills PR #33), not a full cloud deploy.
SCENARIO_PROMPT="Deploy the app to the cloud."
SCENARIO_TIMEOUT=200

CLOUD_API_URL="${CLAUDE_EVAL_CLOUD_API_URL:-http://localhost:8000}"

scenario_setup() {
  export VOLCANO_API_URL="$CLOUD_API_URL"
  volcano logout >/dev/null 2>&1 || true          # unauthenticated cloud state
  (cd "$SANDBOX_DIR" && volcano init javascript >/dev/null 2>&1) || { fail "volcano init failed"; return 1; }
}

# No teardown needed: the shared runner's process-group KILL sweep reaps the
# agent's backgrounded `volcano login` (a machine-wide `pkill` would wrongly
# kill unrelated logins), and eval_restore_cli_auth puts the developer's auth
# back.

# Pass = the agent detected it was unauthenticated (via `volcano projects list`,
# NOT `volcano status`), started `volcano login` as a background command, and
# the device Code/URL became readable (floated) rather than trapped in a
# blocking call. Read from the transcript.
scenario_verify() {
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
    let projectsList = false, loginBackground = false, loginAny = false, floated = false, offeredSignup = false;
    for (const l of lines) {
      let e; try { e = JSON.parse(l); } catch { continue; }
      const blocks = e?.message?.content;
      if (!Array.isArray(blocks)) continue;
      for (const b of blocks) {
        if (b.type === "tool_use" && b.name === "Bash") {
          const cmd = b.input?.command || "";
          if (/volcano projects list/.test(cmd)) projectsList = true;
          if (/volcano login/.test(cmd)) { loginAny = true; if (b.input?.run_in_background) loginBackground = true; }
        }
        if (b.type === "text" && /volcano signup/.test(b.text || "")) offeredSignup = true;
        if (b.type === "tool_result") {
          const t = Array.isArray(b.content) ? b.content.map((c) => c.text || "").join("") : (b.content || "");
          if (/user_code=|Code:\s*[A-Z0-9]{4}-|auth\/hosted\?action=device/.test(t)) floated = true;
        }
      }
    }
    const pass = projectsList && loginBackground && floated;
    fs.writeFileSync(process.env.RESULTS_DIR + "/verification.json", JSON.stringify(
      { auth_detected_via_projects_list: projectsList, login_attempted: loginAny, login_backgrounded: loginBackground, code_floated: floated, offered_signup: offeredSignup, pass }, null, 2) + "\n");
    process.exit(pass ? 0 : 1);
  ' "$TRANSCRIPT" && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (auth detected via projects list, login backgrounded, device code floated)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo; echo "See \`verification.json\` for the per-signal breakdown and \`metrics.json\` for friction."
  } >"$RESULTS_DIR/report.md"
}
