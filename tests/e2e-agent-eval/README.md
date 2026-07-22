# End-to-end agent eval (live, tools-enabled)

Measures how easily a real coding agent — Claude Code with the `volcano`
plugin installed, exactly as an end user would have it — gets from a bare
"build me a todo API" prompt to a working, locally-deployed, invokable
function, using only the `volcano` CLI and this plugin's skills. No scripted
steps are given to the agent; the point is to observe what it does with an
underspecified prompt and measure the friction (or lack of it) along the way.

This is a different kind of test than `tests/agent-eval` (that harness — from
a closed PR, not currently on `main` — runs with tools fully disabled and
checks the model's *text* against deterministic assertions). This one runs
with real tools against a real local Volcano stack, because the thing being
measured (does it thrash on `--help`, does it write-then-delete code, does it
actually get a function deployed and invokable) can only be observed with
real command execution.

## Current scope

- **Local mode only.** No `volcano cloud ...`, no `volcano login`. Cloud
  deploy requires human device-code approval, which can't run unattended —
  that gets its own scenario later, once we're testing the auth-handling
  path specifically.
- **Functions first.** The scenario asks for a full "todo API," but the
  pass/fail bar for this first cut is narrower: at least one function gets
  built, deployed locally, and successfully invoked. Database/migration
  correctness, RLS, and a frontend are not graded yet — they can be added as
  the scenario matures.

See `scenario.md` for the exact prompt, expected path, and rubric.

## Important: local mode is a machine-wide singleton, not per-directory

`volcano start` runs fixed-name Docker containers and a fixed local project
ID (`00000000-0000-0000-0000-000000000000`) — there is one shared local
Volcano instance per machine, not one per scratch directory. Anything else
using local mode on the same machine (another project, a previous manual
session) shows up in this scenario's `volcano functions list` right
alongside whatever the agent built. `run.sh` handles this by forcing a clean
slate (`volcano start` → `volcano reset --yes` → `volcano stop`) before ever
handing off to the agent — the agent still has to start the stack itself, but
whatever it deploys is guaranteed to be the only thing in there. This also
means **two runs of this harness on the same machine at the same time will
collide** — not handled yet, don't parallelize runs on one host.

## Prerequisites

- `volcano` CLI on `PATH`, Docker running (`volcano start` needs it).
- `claude` CLI (Claude Code) with the `volcano` plugin installed and enabled
  from the `volcano-agentic-plugins` marketplace:
  ```sh
  claude plugin marketplace update volcano-agentic-plugins
  claude plugin list   # confirm volcano@volcano-agentic-plugins is enabled
  ```
  The harness does not install the plugin for you — it only checks that it's
  present, since "does a real plugin install behave correctly" is part of
  what's being measured.

## Running it

```sh
./run.sh
```

Env vars (all optional):

| Var | Default | Purpose |
|---|---|---|
| `CLAUDE_EVAL_MODEL` | `sonnet` | Model alias/name passed to `claude --model` |
| `CLAUDE_EVAL_MAX_BUDGET_USD` | unset | Caps spend via `claude --max-budget-usd` |
| `CLAUDE_EVAL_TIMEOUT_SECS` | `600` | Wall-clock cap on the agent session — 10 minutes is intentionally generous for a simple todo API build/deploy/verify; a run that needs longer is itself a finding, not a reason to raise this |
| `CLAUDE_EVAL_PROMPT` | see `scenario.md` | Override the prompt |
| `CLAUDE_EVAL_KEEP_SANDBOX` | unset | Skip deleting the scratch dir afterward |

Each run creates a fresh scratch directory (nothing in this repo is touched
by the agent), runs the agent unattended (`--permission-mode
bypassPermissions` — required since a human isn't present to click through
tool-use prompts), then independently re-verifies the outcome with our own
`volcano` CLI calls from outside the agent's session (never trust the
agent's self-reported "done"). Results land in `results/<timestamp>/`:

- `transcript.jsonl` — raw `--output-format stream-json` session log.
- `metrics.json` — friction metrics parsed from the transcript
  (`analyze-transcript.mjs`): `--help` call count, failed-command count,
  same-file rewrite count, tool-call count.
- `verification.json` — independent post-hoc checks: was the local stack up,
  which functions were deployed, and the result of invoking each one
  **authenticated** (a real session minted via the SDK — see
  `invoke-with-auth.mjs`; `volcano functions invoke` the CLI command has no
  way to supply a bearer token, and a correctly-secured function 401s
  without one, so testing unauthenticated would fail secure functions and
  pass insecure ones).
- `report.md` — human-readable summary of the above plus pass/fail.

`results/` is gitignored — it holds run output, not tracked test source.

## Findings so far (from real runs, not speculation)

- **Bare prompt with no product name never engages the plugin.** "Build me a
  todo API" (no mention of "volcano") produced a plain Express.js app with
  zero Volcano awareness — the plugin's 12 skills are only loaded on-invoke,
  and none of their descriptions are worded to match a generic,
  product-unaware "build an app" request. `scenario.md`'s prompt now says
  "...using volcano" to isolate a different question (does it follow the
  skills well once engaged) from this one (tracked in
  [VOL-473](https://konghq.atlassian.net/browse/VOL-473) alongside a related
  finding, not yet fixed).
- **The `install-volcano` skill's embedded script isn't reliably executed
  verbatim.** Invoking it explicitly (`claude -p "/volcano:install-volcano"`)
  ran a model-reconstructed, shortened version that silently dropped the
  steps that matter (maintaining `~/.volcano/AGENTS.md` and the
  `~/.claude/CLAUDE.md` import), while reporting success. Tracked in
  [VOL-473](https://konghq.atlassian.net/browse/VOL-473).
- **Migration guidance contradicted the live CLI (fixed).** `AGENTS.md`'s
  guidance said to wrap multi-statement migrations in `BEGIN; ... COMMIT;`;
  the real CLI executes each file as exactly one statement and rejects
  multi-statement bodies. An agent run hit this, burned two failed attempts
  and a scratch experiment discovering the constraint itself, then split one
  migration into 12 files by hand. Fixed in `volcano-skills`
  [PR #15](https://github.com/Kong/volcano-skills/pull/15).
- **Once engaged, skill routing and architecture reasoning were essentially
  textbook** — correct skill load order, correct one-function-per-file
  convention, correct RLS/auth-in-handler pattern, and it used `volcano docs
  search`/`volcano docs get` mid-troubleshooting instead of blind `--help`
  guessing.

## Known limitations

Same caveat as `tests/agent-eval`: a live model call is not fully
deterministic. Treat a failing run as a signal to look at the transcript, not
an automatic regression. `metrics.json`'s transcript parsing is best-effort
against the current `stream-json` shape and reports an `unparsed_lines` count
so a parser gap is visible rather than silently swallowed.
