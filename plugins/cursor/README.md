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
- `commands/install-volcano.md` — `/install-volcano` command that reads the plugin's bundled setup skill. Setup reuses a working CLI; installation or an explicit upgrade uses a verified, exact npm version with normal host permissions. Missing bundled instructions require reinstalling the plugin, not downloading replacement instructions.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Install from Cursor Marketplace

Install [Volcano by Kong](https://cursor.com/marketplace/kong/volcano) from Cursor Marketplace (recommended):

1. Open **Customize** in Cursor's sidebar.
2. Search for **Volcano** and select the plugin published by **Kong**.
3. Select **Install** and choose a project or user scope.
4. Run `/install-volcano` in Cursor's Agent chat to set up the CLI through the bundled setup skill. It reuses a working CLI without automatic upgrades.

Marketplace installation does not require a repository clone, shell installer, or VSIX file.

## Components

| Path | Purpose |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor plugin manifest. |
| `skills/` | Materialized canonical Volcano skills, drift-checked against `sources/volcano-skills`. |
| `rules/volcano.mdc` | Always-applied rule: read plugin-shipped Volcano instructions and skills before Volcano work. |
| `commands/install-volcano.md` | `/install-volcano` command pointing to the bundled `skills/install-volcano/SKILL.md`. |

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

## Manual installation (optional)

For installation outside Cursor Marketplace, clone this repository and run the local installer:

```sh
git clone https://github.com/Kong/volcano-agentic-plugins.git
cd volcano-agentic-plugins
sh scripts/install-cursor-plugin.sh
```

If you already have a checkout, run `sh scripts/install-cursor-plugin.sh` from its root.

The script copies `plugins/cursor` into `~/.cursor/plugins/local/volcano`. Restart Cursor or run **Developer: Reload Window**, then check the plugin in **Customize**. Local plugin imports must be allowed. Run `/install-volcano` in Agent chat to set up the CLI through the bundled setup skill. Submodules are not needed for manual installation.

For local development, repeat the copy and reload after editing plugin files.

Do not symlink an external checkout into the local plugins directory; Cursor skips symlinks whose targets are outside that directory. See [Cursor's local plugin instructions](https://cursor.com/docs/plugins#test-plugins-locally).

## Marketplace

This repo is a multi-IDE repository. The Cursor marketplace manifest is at:

```text
.cursor-plugin/marketplace.json
```

Team marketplaces imported from GitHub can enable Auto Refresh to track repository updates. Updates to the public listing are reviewed by Cursor before publication.

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.
