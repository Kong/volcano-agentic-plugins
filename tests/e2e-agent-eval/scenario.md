# Scenario: `todo-api-functions-local`

## Preconditions

- Fresh scratch directory — no pre-existing `volcano/` scaffold.
- `volcano` CLI on `PATH`, Docker available.
- Claude Code `volcano` plugin installed and enabled (latest — see README
  prerequisites).
- No `volcano login`/auth required or expected; this scenario never touches
  `volcano cloud ...`.
- Local Volcano dev state reset (`volcano reset --yes`) immediately before
  the agent runs — local mode is a machine-wide singleton, not scoped to the
  scratch directory, so this is required for a clean slate (see README.md).

## Prompt

```
Build me a todo API using volcano.
```

Still bare on everything else (no mention of local vs. cloud, no mention of
deploying, no mention of testing) but now names "volcano" explicitly. This
changed from the original bare `AGENTS.md`-example prompt ("Build me a todo
API", no product name) after a live run showed the agent has no reliable way
to discover Volcano is relevant without an explicit mention: `AGENTS.md`
isn't auto-loaded by the plugin mechanism itself (only the 12 domain skills'
short descriptions are always-on, and none of them are worded to match a
generic, product-unaware "build an app" prompt), so a fully bare prompt
reliably produced a plain Express.js app with zero Volcano awareness. This
prompt now isolates a different, narrower question: given the minimal signal
a real user would actually type, does the agent then follow `AGENTS.md`'s
default behaviors well (init → functions → auto local deploy → verify), or
does it still thrash? The fully-bare-prompt / plugin-discoverability gap is
tracked separately (VOL-473 covers the related install-skill-reliability
finding from the same investigation).

## Expected path (per `AGENTS.md`'s own documented defaults)

1. Reads the shipped skills (`volcano-platform` at minimum) before writing
   code — does not invent a project shape.
2. Runs `volcano init` before writing any handler code.
3. Writes function handler(s) under `volcano/functions/` (not `src/api/`, no
   OpenAPI dispatcher, no bundled single entry point).
4. Starts the local stack itself (`volcano start`) — not asked to.
5. Deploys locally itself (`volcano functions deploy --all`, plus `volcano
   variables deploy` / `volcano migrations deploy` if the handlers need
   them) — not asked to.
6. Verifies its own work by invoking the deployed function(s) and reporting
   a real result, not just asserting success.
7. Ends with a `Next: ...` suggestion (per `AGENTS.md`) rather than
   proceeding to a cloud deploy unprompted.

## Pass condition

At least one function deployed under `volcano/functions/` responds
successfully (2xx, parseable JSON body) to an independent, **authenticated**
invocation (`invoke-with-auth.mjs`, via a real SDK session — not `volcano
functions invoke`, which has no way to supply a bearer token and would 401 a
correctly-secured function) made by the harness *after* the agent session
ends. This
is the bar for this first cut of the scenario — see `README.md` for what's
explicitly not graded yet (DB/migration correctness, RLS, frontend, cloud).

## Rubric (recorded, not all blocking for pass/fail)

| Signal | How it's captured |
|---|---|
| `--help` invocation count | `analyze-transcript.mjs` scans Bash tool calls |
| Failed command count | `analyze-transcript.mjs` scans tool results for non-zero exit |
| Same-file rewrite count | `analyze-transcript.mjs` counts repeated Write/Edit on one path |
| Aggregate tool-call/turn counts (not per-milestone — `analyze-transcript.mjs` doesn't identify which milestone a tool call belongs to) | `analyze-transcript.mjs`'s `tool_calls`/`num_turns` (best-effort; see its `unparsed_lines`/`unrecognized_event_types` caveats) |
| Did it skip `volcano init`? | inferred from transcript + final file tree |
| Did it auto-deploy locally without being asked? | inferred from transcript (matches `AGENTS.md`'s default) |
| Did it attempt `volcano cloud ...` unprompted? | should not happen in this scenario; flagged as a violation if seen |
| Did it open a browser to diagnose anything? | should not happen; flagged as a violation if seen |
| Final independent invoke result | `verification.json` — the actual pass/fail gate |

## Methodology note: plan-first confirmation vs. one-shot harness

A live run showed the agent (correctly, per `AGENTS.md`'s own precedence rule
that user-level instruction files can override the plugin's auto-deploy
default) can stop after presenting a plan and ask "want me to proceed?" when
the operator's personal global `CLAUDE.md` says to plan before executing.
That's reasonable for a real interactive user, but fatal for a single-turn
`-p` harness with no one to answer — the session ends having built nothing.
`run.sh` compensates with `--append-system-prompt` telling the agent
specifically that this is a non-interactive eval session with no one to
confirm with, so it should proceed — this does not change the scenario
prompt itself, only the one-shot-harness mechanics.

## Out of scope for this cut (tracked, not tested yet)

- Cloud deploy and the `volcano login` device-code flow — separate scenario,
  once we're specifically testing the fuzzy-auth-instructions path.
- Database/migration correctness, RLS policy behavior, storage, realtime.
- Multi-turn follow-up prompts (e.g. "now add a delete endpoint").
