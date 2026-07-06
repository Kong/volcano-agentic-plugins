# Volcano for Cursor

Native Cursor plugin for Volcano. This is **not** a VS Code `.vsix` extension;
Cursor plugins use `.cursor-plugin/plugin.json` plus components discovered from
`rules/`, `skills/`, `commands/`, `hooks/`, and `mcp.json`.

This plugin exposes Volcano's canonical skills as tracked files so Cursor marketplace shallow clones include them:

```txt
plugins/cursor/skills  # materialized from sources/volcano-skills
```

The plugin also includes:

- `rules/volcano.mdc` — always-applied Volcano rule pointing at plugin-shipped Volcano instructions.
- `commands/install-volcano.md` — `/install-volcano` command to install or upgrade the Volcano CLI. The plugin already ships the skills, so this command does not download skills into `~/.volcano/skills`.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Components

| Path | Purpose |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest. |
| `skills/` | Materialized canonical Volcano skills, drift-checked against `sources/volcano-skills`. |
| `rules/volcano.mdc` | Always-applied rule: read plugin-shipped Volcano instructions and skills before Volcano work. |
| `commands/install-volcano.md` | `/install-volcano` command to install or upgrade the Volcano CLI without downloading runtime skills. |

## Why materialized skills?

Cursor marketplace/indexer paths may shallow-clone a plugin repository without
initializing submodules. To keep marketplace installs functional, `skills/` is a
regular tracked directory. The root repo still keeps `sources/volcano-skills` as
the single canonical source and guards against drift:

```sh
pnpm check:skill-submodules
pnpm check:skill-drift
pnpm check:no-content-duplicates
```

## Install locally (manual path)

Cursor has no global `AGENTS.md`/rules file, so the host-agnostic bootstrap
installer can only leave a *project-scoped* rule for Cursor. Installing the
plugin into Cursor's local plugins directory instead gives the full, native
experience across every project — the always-applied Volcano rule **and** the
`volcano-*` skills, just like a Marketplace install.

Run the installer (from a clone of this repo, or piped from GitHub):

```sh
sh scripts/install-cursor-plugin.sh
# …or without a local clone:
curl -fsSL https://raw.githubusercontent.com/Kong/volcano-agentic-plugins/main/scripts/install-cursor-plugin.sh | sh
```

It copies `plugins/cursor` into `~/.cursor/plugins/local/volcano` (override the
target with `CURSOR_PLUGINS_DIR`). Restart Cursor or run **Developer: Reload
Window** afterward.

## Develop locally (symlink)

For plugin development, symlink your working tree so edits are picked up on
reload. Submodules are needed only for CI drift checks, not for local loading:

```sh
mkdir -p ~/.cursor/plugins/local
rm -rf ~/.cursor/plugins/local/volcano
ln -s "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/volcano   # run from the repo root
```

Then restart Cursor or run **Developer: Reload Window**.

## Marketplace

This repo is a multi-IDE repository. The Cursor marketplace manifest is at:

```text
.cursor-plugin/marketplace.json
```

Cursor Marketplace / Team Marketplace auto-refresh should track this repository
and pick up changes pushed to the tracked branch.

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.
