# shellcheck shell=bash
# desc: build a Next.js auth + todo web app -> frontend compiles with the SDK + wired to the local API
#
# Broadens coverage into the volcano-nextjs skill / browser SDK path — untested
# by todo-api-local (functions/DB) and storage-local. The unique signal here is
# that the SDK compiles inside a Next.js production bundle (the VOL-505 ESM
# territory) and that the app is wired to the LOCAL API (localhost:8000, anon
# key from `volcano status`) rather than the production default the skill's env
# example shows. Backend DB/functions correctness is already covered elsewhere.
SCENARIO_PROMPT="Build a Next.js web app where users can sign up, log in, and manage a personal to-do list, using Volcano."
SCENARIO_TIMEOUT=900

scenario_setup() { eval_reset_local_stack; }

# Independent verification (harness-run): locate the Next.js app, confirm it
# produced (or can produce) a production build, and check the local-API wiring.
# Pass requires BOTH: the frontend builds with the SDK AND .env.local is wired
# to the local API (localhost:8000 + a non-empty anon key). A build can succeed
# while pointed at the wrong API, so the env wiring is a hard pass criterion
# (see line ~46), not just a reported signal.
scenario_verify() {
  local pkg app_dir build_ok="false" env_ok="false" build_note="no Next.js + Volcano SDK project found"
  # Locate the project by the package.json that declares BOTH "next" and the
  # Volcano SDK ("@volcano.dev/sdk") — a plain Next.js app is not the signal we
  # want, it would build without ever exercising the SDK. `volcano init nextjs`
  # puts package.json at the project root with the app dir passed as an arg
  # ("next build web"), so there's no next.config and no web/package.json.
  pkg=$(find "$SANDBOX_DIR" -maxdepth 3 -name package.json -not -path '*/node_modules/*' 2>/dev/null | while read -r f; do
    node -e 'const p=require(process.argv[1]);const d={...p.dependencies,...p.devDependencies};process.exit(d.next&&d["@volcano.dev/sdk"]?0:1)' "$f" 2>/dev/null && { echo "$f"; break; }
  done)
  app_dir=${pkg:+$(dirname "$pkg")}

  if [ -n "$app_dir" ]; then
    # Authoritative check: a production build compiles the SDK into the bundle
    # (the agent typically only runs dev locally). Install deps first if absent.
    ( cd "$app_dir"
      [ -d node_modules ] || timeout 300 npm install >"$RESULTS_DIR/next-install.log" 2>&1
      timeout 300 npm run build >"$RESULTS_DIR/next-build.log" 2>&1
    ) && { build_ok="true"; build_note="npm run build exited 0"; } || build_note="npm run build failed — see next-build.log"

    local envf; envf=$(find "$app_dir" -maxdepth 2 -name '.env.local' -not -path '*/node_modules/*' -print -quit 2>/dev/null)
    if [ -n "$envf" ]; then
      cp "$envf" "$RESULTS_DIR/env.local.txt" 2>/dev/null || true
      # Line-anchored (skip commented-out lines), case-sensitive names, and a
      # non-empty value required — an empty/placeholder anon key must not pass.
      grep -qE '^[[:space:]]*NEXT_PUBLIC_VOLCANO_API_URL=(https?://)?(localhost|127\.0\.0\.1):8000\b' "$envf" \
        && grep -qE '^[[:space:]]*NEXT_PUBLIC_VOLCANO_ANON_KEY=[^[:space:]]' "$envf" && env_ok="true"
    fi
  fi

  { [ "$build_ok" = "true" ] && [ "$env_ok" = "true" ]; } && PASS="true"

  {
    echo "# Result: $SCENARIO ($RUN_ID)"; echo
    echo "**Pass:** $PASS  (Next.js app builds with the SDK)"
    echo "**Agent exit code:** $AGENT_EXIT"; echo "**Agent wall time:** ${AGENT_WALL_S}s"
    echo "**App dir:** ${app_dir:-<none>}"
    echo "**Build:** $build_note"
    echo "**Local-API wiring (.env.local -> localhost:8000 + anon key):** $env_ok"
    echo; echo "See \`metrics.json\`, \`env.local.txt\`, and \`next-build.log\` (if built here)."
  } >"$RESULTS_DIR/report.md"
}
