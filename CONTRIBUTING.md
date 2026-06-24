# Contributing

This repository contains Volcano plugins for multiple agentic IDEs. Keep every
plugin a thin shell over the Volcano CLI and keep canonical agent content aligned
with the `volcano-skills` source.

## Local setup

```sh
git submodule update --init --recursive # initializes sources/volcano-skills
pnpm install --frozen-lockfile
```

Requirements:

- Node 24
- pnpm 10.x, currently `pnpm@10.33.0`

## Repository invariants

- `sources/volcano-skills` is the only skills git submodule.
- `plugins/<ide>/skills` directories are regular tracked files, not submodules.
  Marketplace/indexer installs may shallow-clone without initializing
  submodules, so plugin packages must contain materialized skills.
- Materialized plugin skills must match `sources/volcano-skills` byte-for-byte.
- Plugins must drive the `volcano` CLI instead of reimplementing CLI behavior.
- `install-volcano` is the canonical install/upgrade entrypoint name.
- Do not add duplicated canonical content outside approved `plugins/<ide>/skills`
  directories.
- During development, agent guidance should prefer local mode (`volcano ...`) and
  reserve `volcano cloud ...` for explicit cloud requests.

## Updating Volcano skills

When `https://github.com/Kong/volcano-skills` changes:

```sh
git submodule update --remote sources/volcano-skills
pnpm sync:skills
pnpm check:skill-submodules
pnpm check:skill-drift
pnpm check:no-content-duplicates
pnpm check:install-entrypoints
```

Then review and commit both:

- the `sources/volcano-skills` gitlink update
- the materialized changes under every `plugins/<ide>/skills`

Do not restore plugin-local skill submodules. `pnpm check:skill-submodules`
rejects that.

## Validation before committing

Run the main pnpm checks locally:

```sh
make test
```

`make test` expands to:

```sh
pnpm check:skill-submodules
pnpm check:skill-drift
pnpm check:no-content-duplicates
pnpm check:install-entrypoints
pnpm check:marketplace-assets
pnpm check:codex
pnpm check:claude-desktop
pnpm -r typecheck
```

For full local validation, including host-specific validators and package builds:

```sh
make validate
```

`make validate` additionally runs:

```sh
claude plugin validate plugins/claude-code
pnpm --filter volcano build
pnpm package:vscode
pnpm package:claude-desktop
```

Expected artifacts:

- `plugins/vscode/volcano.vsix`
- `/tmp/volcano-claude-desktop.mcpb`

`*.vsix`, `*.mcpb`, and build outputs are ignored and should not be committed.

## Shallow-clone smoke test

Before a release, verify marketplace shallow-clone behavior from a clean temp
checkout with no submodules:

```sh
SRC=/Users/ted.kim/workspace/volcano-agentic-plugins
TMP_ROOT=$(mktemp -d /tmp/volcano-agentic-plugins-smoke.XXXXXX)
git clone --depth=1 --no-recurse-submodules "file://$SRC" "$TMP_ROOT/repo"
cd "$TMP_ROOT/repo"
pnpm install --frozen-lockfile

for plugin in cursor claude-code claude-desktop codex; do
  test -f "plugins/$plugin/skills/AGENTS.md"
  test -f "plugins/$plugin/skills/install-volcano/SKILL.md"
  ! git ls-files --stage "plugins/$plugin/skills" | grep -q '^160000 '
done

pnpm check:no-content-duplicates
pnpm check:install-entrypoints
pnpm check:marketplace-assets
pnpm check:codex
pnpm check:claude-desktop
claude plugin validate plugins/claude-code
pnpm --filter volcano build
pnpm package:vscode
pnpm package:claude-desktop

cd /
rm -rf "$TMP_ROOT"
```

The only uninitialized submodule in this clone should be
`sources/volcano-skills`.

## Marketplace assets and metadata

Current marketplace assets are intentionally simple generated Volcano placeholders
unless/until official brand artwork is provided.

Tracked asset locations:

- `plugins/vscode/resources/icon.png` — VS Code/Open VSX icon, 128x128 PNG
- `plugins/claude-desktop/icon.png` — MCPB icon, 512x512 PNG
- `plugins/codex/assets/volcano-logo.svg`
- `plugins/codex/assets/volcano-icon.png`
- `plugins/cursor/assets/volcano-logo.svg`
- `plugins/cursor/assets/volcano-icon.png`
- `plugins/claude-code/assets/volcano-logo.svg`
- `plugins/claude-code/assets/volcano-icon.png`

If replacing assets with official artwork, update all relevant files and run:

```sh
pnpm check:marketplace-assets
pnpm package:vscode
pnpm package:claude-desktop
```

Only add manifest fields that are accepted by the relevant host validators or
known marketplace examples. `pnpm check:marketplace-assets` guards the currently
confirmed fields.

## Release process

1. Ensure `main` is clean and all validation checks pass.
2. Bump versions together in:
   - root `package.json`
   - `plugins/vscode/package.json`
   - `plugins/cursor/.cursor-plugin/plugin.json`
   - `plugins/claude-code/.claude-plugin/plugin.json`
   - `plugins/claude-desktop/manifest.json`
   - `plugins/codex/.codex-plugin/plugin.json`
3. Commit the release prep.
4. Push `main`.
5. Create and push an annotated tag:

   ```sh
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

Pushing a `v*` tag triggers the `Release plugin artifacts` workflow. That workflow
publishes GitHub Release assets:

- `volcano-vscode.vsix`
- `volcano-claude-desktop.mcpb`

It does not publish directly to external marketplaces. VS Code Marketplace, Open
VSX, Cursor, Claude Code, Claude Desktop directory/review, and Codex marketplace
submission/discovery remain marketplace-specific follow-up steps.

## Plugin-specific notes

- VS Code uses `plugins/vscode` and packages as a VSIX. Cursor is not a VSIX host.
- Cursor uses `.cursor-plugin/plugin.json`, rules, commands, and materialized
  `skills/`.
- Claude Code uses `.claude-plugin/plugin.json`, commands, and materialized
  `skills/`.
- Claude Desktop uses an MCP Bundle shape with a minimal local setup/instruction
  MCP server. It is not the full Volcano MCP action surface.
- Codex uses `.codex-plugin/plugin.json` plus the repo marketplace manifest at
  `.agents/plugins/marketplace.json`.

## CI

CI runs on Node 24 and should include:

- canonical source submodule freshness check
- materialized skill drift check
- duplicate canonical content guard
- install entrypoint guard
- marketplace asset/metadata guard
- plugin smoke checks
- typecheck/build/package checks

If a change cannot satisfy one of these checks, treat it as a release blocker
unless the invariant itself is intentionally changed and documented here.
