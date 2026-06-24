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

## Test locally in Cursor

Cursor can load local plugins from `~/.cursor/plugins/local`.

Use a normal clone of this repository. Submodules are needed only for CI drift
checks, not for local Cursor plugin loading:

```sh
mkdir -p ~/.cursor/plugins/local
rm -rf ~/.cursor/plugins/local/volcano
ln -s /Users/ted.kim/workspace/volcano-agentic-plugins/plugins/cursor \
  ~/.cursor/plugins/local/volcano
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
