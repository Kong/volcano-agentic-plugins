# Agent-behavior eval harness

Checks whether a real model, given the canonical `AGENTS.md`
(`sources/volcano-skills/AGENTS.md`) as context, actually behaves according to
the response guidelines — not just that the markdown reads correctly to a
human/Copilot reviewer.

This closes a real gap: every other check in this repo (`check:skill-drift`,
`check:install-entrypoints`, etc.) is structural/static. Nothing previously
verified that an agent given these instructions would, for example, correctly
branch its next-step suggestion on auth/project state, or actually stop and
ask before a cloud deploy.

## How it works

1. `tests/agent-eval/scenarios.mjs` defines scenarios: a user prompt (often
   with simulated `volcano status`-style context) plus a set of deterministic
   assertions, each traceable to a specific `AGENTS.md` rule via the `rule`
   field.
2. The runner (`scripts/eval-agent-guidance.mjs`) builds a system prompt from
   the live `AGENTS.md` content, sends each scenario's prompt to a real model,
   and checks the response against the scenario's assertions.
3. Assertions are plain string/regex checks (see
   `scripts/lib/agent-eval-assertions.mjs`) — no LLM-as-judge is required for
   the blocking checks, so results are deterministic given a fixed model
   response. An optional advisory `judge(...)` assertion type exists for
   softer semantic checks; judge results are reported but non-blocking unless
   a scenario explicitly opts in.

## Running it

```sh
# Structural lint only — no API key, no network. Runs in every CI build.
pnpm eval:agent-guidance:lint

# Deterministic self-test of the assertion logic itself, using hand-written
# fixture responses (no API key, no network). Also runs in every CI build.
pnpm eval:agent-guidance:selftest

# Live run against a real model. Requires OPENAI_API_KEY.
OPENAI_API_KEY=sk-... pnpm eval:agent-guidance
```

## CI wiring

- `check:agent-eval-lint` and `check:agent-eval-selftest` run unconditionally
  in `.github/workflows/ci.yml` (fast, free, no secrets needed).
- `.github/workflows/agent-eval.yml` runs the live model eval on pull
  requests, gated on `secrets.OPENAI_API_KEY` being configured. It's a no-op
  (not a failure) when the secret isn't available, so forks/external
  contributors never get blocked by it.

## Adding a scenario

1. Add a scenario object to `tests/agent-eval/scenarios.mjs`, citing the exact
   `AGENTS.md` rule it checks in the `rule` field.
2. Add a matching `compliant`/`violating` fixture pair to
   `scripts/eval-agent-guidance-selftest.mjs`. The self-test fails loudly if a
   scenario has no fixture, and fails if the compliant fixture doesn't pass or
   the violating fixture isn't caught — this keeps the assertion logic honest
   independent of any live model call.
3. Run `pnpm eval:agent-guidance:selftest` locally before opening a PR.

**Gotcha:** the `Next:` line assertions check literal `\n`-delimited lines.
Don't hand-wrap a `Next: ...` fixture string across multiple array entries in
a way that inserts a real newline in the middle of the logical line — it will
look like two lines (or a missing line) to `nextStepLines()`.
