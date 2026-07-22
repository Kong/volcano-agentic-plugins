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
Build me a todo API.
```

Deliberately bare — no mention of local vs. cloud, no mention of deploying,
no mention of testing. This is the exact example phrase `AGENTS.md` itself
uses for the "build X" default-behavior rule, so it's the most realistic
underspecified prompt to probe that rule with.

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
successfully (2xx, parseable JSON body) to an independent `volcano functions
invoke <name>` call made by the harness *after* the agent session ends. This
is the bar for this first cut of the scenario — see `README.md` for what's
explicitly not graded yet (DB/migration correctness, RLS, frontend, cloud).

## Rubric (recorded, not all blocking for pass/fail)

| Signal | How it's captured |
|---|---|
| `--help` invocation count | `analyze-transcript.mjs` scans Bash tool calls |
| Failed command count | `analyze-transcript.mjs` scans tool results for non-zero exit |
| Same-file rewrite count | `analyze-transcript.mjs` counts repeated Write/Edit on one path |
| Turns/tool-calls to each milestone | `analyze-transcript.mjs` (best-effort; see its `unparsed_lines` caveat) |
| Did it skip `volcano init`? | inferred from transcript + final file tree |
| Did it auto-deploy locally without being asked? | inferred from transcript (matches `AGENTS.md`'s default) |
| Did it attempt `volcano cloud ...` unprompted? | should not happen in this scenario; flagged as a violation if seen |
| Did it open a browser to diagnose anything? | should not happen; flagged as a violation if seen |
| Final independent invoke result | `verification.json` — the actual pass/fail gate |

## Out of scope for this cut (tracked, not tested yet)

- Cloud deploy and the `volcano login` device-code flow — separate scenario,
  once we're specifically testing the fuzzy-auth-instructions path.
- Database/migration correctness, RLS policy behavior, storage, realtime.
- Multi-turn follow-up prompts (e.g. "now add a delete endpoint").
