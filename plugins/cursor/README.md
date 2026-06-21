# Volcano for Cursor

Native Cursor plugin for Volcano. This is **not** a VS Code `.vsix` extension;
Cursor plugins use `.cursor-plugin/plugin.json` plus components discovered from
`rules/`, `skills/`, `commands/`, `hooks/`, and `mcp.json`.

This plugin exposes Volcano's canonical skills without copying them:

```txt
plugins/cursor/skills  # git submodule: https://github.com/kong/volcano-skills.git
```

The plugin also includes:

- `rules/volcano.mdc` — always-applied Volcano rule pointing at canonical runtime instructions.
- `commands/install-volcano.md` — agent-executable command to install/refresh Volcano CLI + canonical skills.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Components

| Path | Purpose |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest. |
| `skills/` | Plugin-local git submodule for canonical Volcano skills. |
| `rules/volcano.mdc` | Always-applied rule: install/read canonical Volcano instructions and skills before Volcano work. |
| `commands/install-volcano.md` | Agent-executable command to install/refresh Volcano CLI + canonical skills. |

## Why a plugin-local skills submodule?

A Cursor plugin can embed `skills/*/SKILL.md`, but copying those files into every
IDE plugin would drift. A plugin-local git submodule gives Cursor a real
`skills/` directory while keeping `volcano-skills` as the single canonical source.

The root repo includes guards:

```sh
pnpm check:skill-submodules
pnpm check:no-content-duplicates
```

## Test locally in Cursor

Cursor can load local plugins from `~/.cursor/plugins/local`.

Use a clone with submodules initialized:

```sh
git submodule update --init --recursive
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

## Submodule caveat

The plugin depends on `plugins/cursor/skills` being initialized. If a marketplace
or indexer does not clone submodules, we'll need a publish-time materialization
step or a marketplace source rooted at `volcano-skills` itself.
