# Running the agent evals — operational guide

Everything you need to run a scenario, pick which server build it runs against,
and point the CLI at the right API — so you don't rediscover the setup each time.
For what the harness *is* and how to author scenarios, see [`README.md`](./README.md).

## TL;DR

```bash
cd tests/e2e-agent-eval
./run.sh --list                 # scenarios + one-line descriptions
./run.sh todo-api-local         # run one; exit 0 = pass, 1 = fail
```

The harness drives the agent against a local Volcano stack at
`http://localhost:8000`. The two knobs you'll actually reach for:

- **`VOLCANO_IMAGE`** — which server *image* the local stack runs.
- **`VOLCANO_API_URL`** — which API URL the CLI, agent, and verifier point at.

## Prerequisites

- `volcano`, `claude`, `docker`, `node` (>=20) on `PATH`; Docker running.
- **A logged-in Claude Code session.** The agent runs as a `claude` subprocess; an
  expired session fails *every* run with `401 authentication_failed`. Probe with
  `claude -p "reply with exactly: OK"`. Only a human can re-auth (interactive).
- Verifier deps (`@volcano.dev/sdk`) auto-install on first run.

## Choosing the server image — `VOLCANO_IMAGE`

`volcano start` (called by the harness for local scenarios) runs a server image.
Precedence: `--image` > `VOLCANO_IMAGE` env > the CLI's bundled default. An
explicitly selected image **must already exist locally** — the CLI never pulls an
unpublished local-mode image and fails fast if it's missing.

```bash
# CLI's bundled default:
./run.sh todo-api-local
# a build you made and tagged:
VOLCANO_IMAGE=volcano-local:develop ./run.sh todo-api-local
```

### Build a fresh image from a branch or PR

To exercise server code from `develop` (or a PR) rather than the released default,
build it locally and pass its tag. Keep a hosting checkout around and refresh it
each session:

```bash
# one-time
git clone https://github.com/Kong/volcano-hosting /tmp/vh && cd /tmp/vh

# per session — build from develop
git fetch origin develop && git reset --hard origin/develop
DOCKER_BUILDKIT=1 docker build -t volcano-local:develop .

# run against it
cd /path/to/volcano-agentic-plugins/tests/e2e-agent-eval
VOLCANO_IMAGE=volcano-local:develop ./run.sh <scenario>
```

For a specific PR:

```bash
cd /tmp/vh
git fetch origin pull/<N>/head && git checkout FETCH_HEAD
DOCKER_BUILDKIT=1 docker build -t volcano-local:pr<N> .
VOLCANO_IMAGE=volcano-local:pr<N> ./run.sh <scenario>
```

Rule of thumb: **build fresh from the target branch each session; don't reuse a
stale ad-hoc tag** — it's the difference between testing your change and testing
whatever was built days ago.

## Pointing at a specific API — `VOLCANO_API_URL`

Local-mode commands (`volcano start` / `status` / `functions deploy`) always target
the local stack at `localhost:8000`. But an installed CLI may be a *staging* build
whose **cloud** commands default to `api.staging.volcano.dev`. To force the agent's
CLI, the verifier's SDK, and any cloud commands at one server, export it before the
run (the agent and verifier inherit the environment):

```bash
export VOLCANO_API_URL=http://localhost:8000
./run.sh <scenario>
```

Precedence: `VOLCANO_API_URL` env > runtime override > compiled default.

## Test against an already-running hosting server

Have a server already up at `localhost:8000` (e.g. a build from a PR you're
reviewing)? Run the suite against it, and pin the image so the harness's per-run
reset re-creates the *same* build rather than a default one:

```bash
export VOLCANO_API_URL=http://localhost:8000        # override the staging default
VOLCANO_IMAGE=<the running image tag> ./run.sh <scenario>
```

Why `VOLCANO_IMAGE` is still needed: each scenario's setup runs
`eval_reset_local_stack` (`volcano start` → `reset` → `stop`) for isolation, so
local scenarios rebuild a **clean** stack from `VOLCANO_IMAGE` each time. Point it
at the tag the server is running (check with
`docker inspect volcano-server --format '{{.Config.Image}}'`) to keep testing that
build. The two cloud scenarios already self-set `VOLCANO_API_URL` from
`CLAUDE_EVAL_CLOUD_API_URL` (default `localhost:8000`).

## Cloud scenarios (`deploy-auth`, `cloud-deploy`)

- **`deploy-auth`** is transcript-based: it checks the agent detects the unauth
  state (via `volcano projects list`), backgrounds `volcano login`, and floats the
  device code — no login actually completes, so it needs no browser.
- **`cloud-deploy`** authenticates non-interactively with `--token`
  (`$CLAUDE_EVAL_CLOUD_TOKEN`, default the local-dev platform token), creates an
  isolated project, deploys, and verifies via `volcano cloud functions list`.

Set `CLAUDE_EVAL_CLOUD_API_URL` / `CLAUDE_EVAL_CLOUD_TOKEN` to target real cloud
instead of the local server.

## Results

```
results/<scenario>/<run-id>/
  report.md            # pass/fail + headline numbers
  metrics.json         # tool_calls, failed_tool_calls, help_invocations, per-tool
  <verifier artifact>  # scenario-specific, e.g. variables-result.json
  transcript.jsonl     # full agent session (stream-json)
```

`CLAUDE_EVAL_KEEP_SANDBOX=1` keeps the agent's scratch dir (path printed at the end)
for inspection instead of deleting it.

## Cleanup & recovery

```bash
pkill -f "volcano login"                     # reap stray device-flow pollers
volcano reset --yes                          # drop local DBs if authed calls start failing (then re-deploy migrations)
docker rm -f volcano-server volcano-postgres volcano-redis volcano-dynamodb volcano-mailpit
```

Leave `volcano-control-plane` / `volcano-worker*` containers alone.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Every run `401 authentication_failed` / "OAuth session expired" | Expired Claude Code session — re-auth interactively; the harness can't. |
| `image ... must already exist locally` | Build the image first (see above); the CLI won't pull local-mode images. |
| Local scenario stack looks wrong / stale | `volcano reset --yes`, or let the next run's `eval_reset_local_stack` rebuild it. |
| Cloud scenario can't reach the server | `curl localhost:8000` to confirm it's up; check `CLAUDE_EVAL_CLOUD_API_URL`. |
| Testing a build but seeing old behavior | You're on a stale `VOLCANO_IMAGE` tag — rebuild from the target branch. |
