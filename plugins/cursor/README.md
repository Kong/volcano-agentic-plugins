# Volcano for Cursor

Native Cursor plugin for Volcano. This is **not** a VS Code `.vsix` extension;
Cursor plugins use `.cursor-plugin/plugin.json` plus components discovered from
`rules/`, `skills/`, `commands/`, `hooks/`, and `mcp.json`.

This plugin currently ships:

- `rules/volcano.mdc` — always-applied Volcano CLI-first rules and safety model,
  generated from `sources/volcano-skills/AGENTS.md`.
- `skills/*/SKILL.md` — Volcano platform skills, generated from the
  `sources/volcano-skills` submodule.
- `assets/` — canonical `AGENTS.md`, `CLAUDE.md`, and `index.json` snapshots for
  traceability.

There is intentionally **no MCP config yet**; Volcano does not currently ship an
MCP server.

## Source of truth

The canonical skills source is the `sources/volcano-skills` git submodule
(`https://github.com/kong/volcano-skills`). To refresh this plugin after that
submodule changes:

```sh
pnpm sync:cursor
```

## Test locally in Cursor

Cursor can load local plugins from `~/.cursor/plugins/local`.

```sh
mkdir -p ~/.cursor/plugins/local
ln -s /Users/ted.kim/workspace/volcano-agentic-plugins/plugins/cursor \
  ~/.cursor/plugins/local/volcano
```

Then restart Cursor or run **Developer: Reload Window**. The plugin should appear
with its rule and skills in Cursor's Rules/Skills settings.

## Marketplace

This repo is a multi-plugin repository. The marketplace manifest is at:

```text
.cursor-plugin/marketplace.json
```

Cursor Marketplace / Team Marketplace auto-refresh should track this repository
and pick up changes pushed to the tracked branch.
