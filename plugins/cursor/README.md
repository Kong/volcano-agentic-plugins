# Volcano for Cursor

Native Cursor plugin for Volcano. This is **not** a VS Code `.vsix` extension;
Cursor plugins use `.cursor-plugin/plugin.json` plus components discovered from
`rules/`, `skills/`, `commands/`, `hooks/`, and `mcp.json`.

This plugin exposes Volcano's canonical skills without copying them:

```txt
skills -> ../../sources/volcano-skills
```

So Cursor can see the canonical Volcano skills from the single source of truth:

```txt
sources/volcano-skills
```

The plugin also includes:

- `rules/volcano.mdc` — always-applied Volcano rule pointing at canonical runtime instructions.
- `commands/install-volcano.md` — agent-executable command to install/refresh Volcano CLI + canonical skills.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Components

| Path | Purpose |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest. |
| `skills` | Symlink to `../../sources/volcano-skills`. |
| `rules/volcano.mdc` | Always-applied pointer rule: install/read canonical Volcano instructions and skills before Volcano work. |
| `commands/install-volcano.md` | Agent-executable command to install/refresh Volcano CLI + canonical skills. |

## Why symlinked skills?

A Cursor plugin can embed `skills/*/SKILL.md`, but copying those files into every
IDE plugin would drift. The monorepo rule is: **canonical content lives once in
`sources/volcano-skills`; plugin directories expose it by symlink when the IDE
requires local skill files.**

The root repo includes a guard:

```sh
pnpm check:no-content-duplicates
```

## Test locally in Cursor

Cursor can load local plugins from `~/.cursor/plugins/local`.

For symlinks to resolve, copy or symlink the plugin from a clone that has
submodules initialized:

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

## Symlink caveat

The plugin depends on the `sources/volcano-skills` submodule being available. If
a marketplace/indexer does not follow symlinks into submodules, we'll need a
publish-time materialization step or a marketplace source rooted at
`volcano-skills` itself.
