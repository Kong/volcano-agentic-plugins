# volcano-agentic-plugins

Monorepo for Volcano's plugins/extensions across agentic IDEs.

These plugins are **thin shells over the Volcano CLI**. They add the
human-facing UX an editor can provide (commands, status bar, onboarding,
settings) but never re-implement Volcano's behavior. The action surface stays
the CLI; canonical agent content is shared through plugin-local
`volcano-skills` submodules, or fetched/installed at runtime.

## Layout

```txt
packages/   shared libraries (reused by every plugin)
plugins/    publishable, per-IDE plugins (one directory per IDE)
```

| Workspace | Path | Description |
| --- | --- | --- |
| `@volcano-plugins/core` | `packages/core` | Shared TS helpers: base-URL resolution, CLI runner, runtime content fetcher. |
| `volcano` (VS Code) | `plugins/vscode` | VS Code extension (`.vsix` / Open VSX; also Windsurf and other vsix forks). |
| `volcano` (Cursor) | `plugins/cursor` | Cursor native plugin (`.cursor-plugin/plugin.json` + skills submodule/rules/commands). |
| `volcano` (Claude Code) | `plugins/claude-code` | Claude Code plugin (`.claude-plugin/plugin.json` + skills submodule/command). |
| `volcano` (Claude Desktop) | `plugins/claude-desktop` | Claude Desktop Extension / MCP Bundle (`manifest.json` + local setup/instruction MCP server). |
| `volcano` (Codex) | `plugins/codex` | Codex plugin (`.codex-plugin/plugin.json` + skills submodule). |
| `volcano-skills` | `plugins/*/skills` | Canonical Volcano agent instructions and skills, vendored as plugin-local git submodules. |

Different IDEs use different plugin formats, so each gets its own target:

- **VS Code-family** (`plugins/vscode`) — `.vsix` extension. **Not Cursor.**
- **Cursor** (`plugins/cursor`) — Cursor's own plugin format
  (`.cursor-plugin/plugin.json` + rules/commands + `skills` submodule). It exposes
  canonical skills via `plugins/cursor/skills` and provides `/install-volcano`.
  No MCP yet.
- **Claude Code** (`plugins/claude-code`) — Claude Code plugin with canonical skills exposed via `plugins/claude-code/skills` and setup command `/volcano:install-volcano`.
- **Claude Desktop** (`plugins/claude-desktop`) — Desktop Extension / MCP Bundle scaffold with a local setup/instruction MCP server, `install-volcano` tool, and canonical skills in `plugins/claude-desktop/skills`. This is not the full Volcano MCP action surface yet.
- **Codex** (`plugins/codex`) — Codex plugin with canonical skills (including `/install-volcano`) exposed via `plugins/codex/skills` and repo marketplace entry at `.agents/plugins/marketplace.json`. No MCP yet.
- opencode — AGENTS.md + MCP config via bootstrap; no native plugin planned.

## Adding a new IDE plugin

1. Create `plugins/<ide>/` with its own plugin manifest/files.
2. If the IDE requires local skills, add `https://github.com/kong/volcano-skills.git`
   as `plugins/<ide>/skills` (a plugin-local submodule), not as copied files.
3. Depend on `@volcano-plugins/core` (`"workspace:*"`) if the plugin needs TS
   helpers for base-URL/CLI/content logic — do not re-implement them.
4. Keep it a thin shell: drive the CLI, expose/fetch/install canonical content,
   and keep origins configurable.

## Design rules (enforced in review/CI)

A plugin in this repo **must not**:

1. **Copy content** — skills, `AGENTS.md`, command surface, or safety text.
   Canonical skill content must enter a plugin only through a plugin-local
   `skills` git submodule or runtime bootstrap/fetch.
2. **Pin stale skill submodules** — every `plugins/<ide>/skills` submodule must
   point at the latest `volcano-skills` remote HEAD.
3. **Re-implement a CLI command** — drive the `volcano` binary instead.
4. **Hardcode a non-overridable origin** — honor `volcano.webUrl` / `volcano.apiUrl`
   (and `VOLCANO_WEB_URL` / `VOLCANO_API_URL`) so localhost dev and prod both work.

`bootstrap.sh` + the CLI remain the permanent, advertised floor. Plugins are an
enhancement, never a prerequisite.

## Toolchain

- Node ≥ 24, pnpm ≥ 9
- TypeScript, esbuild for extension bundling

```sh
git submodule update --init --recursive
pnpm install
pnpm build                       # build all packages + plugins
pnpm typecheck                   # typecheck everything
pnpm check:skill-submodules      # verify skill submodules are latest
pnpm check:no-content-duplicates # verify plugins do not copy canonical content
pnpm check:install-entrypoints   # verify every plugin exposes an install-volcano path
pnpm package:vscode              # produce plugins/vscode/volcano.vsix
pnpm package:claude-desktop      # validate and pack a Claude Desktop MCPB to /tmp
```

## Release artifacts

The release workflow publishes downloadable assets for web install CTAs:

```txt
https://github.com/Kong/volcano-agentic-plugins/releases/latest/download/volcano-vscode.vsix
https://github.com/Kong/volcano-agentic-plugins/releases/latest/download/volcano-claude-desktop.mcpb
```

Use `workflow_dispatch` with a tag like `v0.0.1`, or push a `v*` tag.

## Status

- [x] Monorepo scaffold (`packages/` + `plugins/`)
- [x] `@volcano-plugins/core`
- [x] `plugins/vscode` (VS Code / vsix forks) — scaffold
- [x] `plugins/cursor` (Cursor native plugin) — scaffold (skills submodule + `/install-volcano`, no MCP)
- [x] `plugins/claude-code` (Claude Code) — scaffold (skills submodule + `/volcano:install-volcano`, no MCP)
- [x] `plugins/claude-desktop` (Claude Desktop) — scaffold (MCPB setup/instruction server + `install-volcano` tool + skills submodule)
- [x] `plugins/codex` (Codex) — scaffold (skills submodule including `/install-volcano` + repo marketplace entry, no MCP)
