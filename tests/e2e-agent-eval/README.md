# Agent eval harness

Runs a coding agent (Claude Code + the Volcano plugin) against a **scenario** and
scores how well it did — with an *independent* verification (the harness checks
the result itself; it does not trust the agent's summary). Use it to catch
skill-doc gaps that make the agent loop, thrash, or do the wrong thing, then
fix the skills and re-run.

## Run it

```bash
cd tests/e2e-agent-eval
./run.sh                 # default scenario: todo-api-local
./run.sh <scenario>      # e.g. ./run.sh deploy-auth
./run.sh --list          # list scenarios + one-line descriptions
```

Preflight requires `volcano`, `claude`, `docker`, `node` (>=20) on `PATH`, Docker
running, and a valid plugin manifest. Verifier deps (`@volcano.dev/sdk`) install
automatically on first run.

### Scenarios

| Scenario | What it checks | Precondition |
|----------|----------------|--------------|
| `todo-api-local` | bare "build a todo app" → auto local deploy → authenticated invoke round-trip | local Docker stack (`volcano start`) |
| `deploy-auth` | unauth "deploy to cloud" → detect auth need → **background** `volcano login` + float the device code | a hosting server at `$CLAUDE_EVAL_CLOUD_API_URL` serving the device-auth flow |
| `cloud-deploy` | authenticated + authorized "deploy to cloud" → project context → confirm → deploy → verify | hosting at `$CLAUDE_EVAL_CLOUD_API_URL` accepting `$CLAUDE_EVAL_CLOUD_TOKEN` |

The cloud scenarios point at a local hosting server by default
(`http://localhost:8000`, e.g. a `make dev` instance); set the env vars below to
target a real cloud.

### Output

Each run writes `results/<scenario>/<run-id>/`:

- `report.md` — pass/fail + headline numbers.
- `metrics.json` — friction signals from the transcript (`tool_calls`,
  `failed_tool_calls`, `help_invocations`, per-tool counts, …).
- `verification.json` — the harness's own independent check (e.g. the invoke
  round-trip, or the per-signal auth-flow breakdown).
- `transcript.jsonl` — the full agent session (stream-json) for manual reading.

Exit code is `0` on pass, `1` on fail.

### Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `CLAUDE_EVAL_MODEL` | `sonnet` | model to run |
| `CLAUDE_EVAL_TIMEOUT_SECS` | scenario's | hard timeout (agent is tree-killed) |
| `CLAUDE_EVAL_PROMPT` | scenario's | override the prompt |
| `CLAUDE_EVAL_KEEP_SANDBOX` | unset | keep the scratch dir instead of deleting it |
| `CLAUDE_EVAL_MAX_BUDGET_USD` | unset | cap agent spend |
| `CLAUDE_EVAL_CLOUD_API_URL` | `http://localhost:8000` | hosting URL for cloud scenarios |
| `CLAUDE_EVAL_CLOUD_TOKEN` | local-dev token | platform token for `cloud-deploy` |

## The workflow (for agents optimizing the skills)

1. `./run.sh <scenario>` and read `report.md` + `metrics.json`.
2. If it failed or thrashed (high `failed_tool_calls`, repeated commands, `--help`
   loops), open `transcript.jsonl` and find *where* — the tool sequence shows the
   friction point.
3. Decide: is it a **skill-doc gap** (missing/misleading guidance) or a real
   platform/CLI bug? Fix the skill in `volcano-skills` (materialized here under
   `plugins/*/skills/`), or file a platform ticket.
4. Re-run the same scenario to confirm the fix and no regression.

Do **not** optimize the skills for a test artifact (e.g. behavior that only
happens when pointing a `volcano cloud` command at a local-mode server) — fix
those in the harness/setup, not the canonical docs.

## Add a scenario

Create `scenarios/<name>/scenario.sh`. Set the prompt/timeout and, optionally,
define bash hooks — the shared runner (`lib/run-agent.sh`) does preflight,
sandboxing, AGENTS.md injection, the `claude` invocation, tree-kill, and metrics.

```bash
# desc: one line shown by ./run.sh --list
SCENARIO_PROMPT="Build an app that lets users upload and list files."
SCENARIO_TIMEOUT=600

# optional — runs before the agent; $SANDBOX_DIR is set, cwd-independent
scenario_setup()   { eval_reset_local_stack; }         # e.g. reset local stack / auth / init an app
# optional — runs after; must set PASS=true|false and write $RESULTS_DIR/report.md.
# Available: $SANDBOX_DIR $TRANSCRIPT $METRICS_JSON $RESULTS_DIR $RUN_ID $AGENT_EXIT $AGENT_WALL_S
scenario_verify()  { ...; PASS="true"; }
# optional — best-effort cleanup on exit (delete cloud projects, kill strays, …)
scenario_teardown() { ...; }
```

Helpers from `lib/run-agent.sh`: `log` / `fail`, `eval_reset_local_stack`,
`kill_tree`. Verifier scripts live alongside (`invoke-with-auth.mjs`,
`analyze-transcript.mjs`) and can be reused.

> Note on AGENTS.md: `run.sh` injects `plugins/claude-code/skills/AGENTS.md` as
> the system prompt because `--setting-sources project,local` excludes the user
> scope that normally carries it (via `~/.claude/CLAUDE.md`). This replicates the
> real plugin UX; without it the agent misclassifies "build X" and stops at a
> plan.
