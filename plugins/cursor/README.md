# Volcano for Cursor

Native Cursor plugin for Volcano. This is **not** a VS Code `.vsix` extension;
Cursor plugins use `.cursor-plugin/plugin.json` plus components discovered from
`rules/`, `skills/`, `commands/`, `hooks/`, and `mcp.json`.

This plugin is intentionally **pointer-only**:

- It does **not** copy `SKILL.md` files.
- It does **not** copy `AGENTS.md` / `CLAUDE.md`.
- It does **not** include MCP config yet; Volcano does not currently ship MCP.

Instead, it points Cursor Agent at the canonical install/source:

- Runtime install: `~/.volcano/AGENTS.md` and `~/.volcano/skills/*/SKILL.md`
- Source of truth: `sources/volcano-skills` (`https://github.com/kong/volcano-skills`)
- Bootstrap: `https://volcano.dev/bootstrap.sh`

## Components

| Path | Purpose |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest. |
| `rules/volcano.mdc` | Always-applied pointer rule: install/read canonical Volcano instructions and skills before Volcano work. |
| `commands/install-volcano.md` | Agent-executable command to install/refresh Volcano CLI + canonical skills. |

## Why no embedded skills?

A Cursor plugin can embed `skills/*/SKILL.md`, but doing so would duplicate the
canonical source and eventually drift as we add more IDE plugins. The monorepo
rule is: **canonical content lives once in `sources/volcano-skills`; plugin
directories are adapters that point at it.**

The root repo includes a guard:

```sh
pnpm check:no-content-duplicates
```

## Test locally in Cursor

Cursor can load local plugins from `~/.cursor/plugins/local`.

```sh
mkdir -p ~/.cursor/plugins/local
ln -s /Users/ted.kim/workspace/volcano-agentic-plugins/plugins/cursor \
  ~/.cursor/plugins/local/volcano
```

Then restart Cursor or run **Developer: Reload Window**.

## Marketplace

This repo is a multi-plugin repository. The marketplace manifest is at:

```text
.cursor-plugin/marketplace.json
```

Cursor Marketplace / Team Marketplace auto-refresh should track this repository
and pick up changes pushed to the tracked branch. Since this plugin is
pointer-only, marketplace refresh updates plugin wiring, while canonical skill
content remains in `volcano-skills` and is installed/refreshed via bootstrap.
