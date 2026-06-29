# volcano-agentic-plugins

Monorepo for Volcano's plugins/extensions across agentic IDEs.

These plugins are **thin shells over the Volcano CLI**. They add the
human-facing UX an editor can provide (commands, status bar, onboarding,
settings) but never re-implement Volcano's behavior. The action surface stays
the CLI; canonical agent content is materialized into plugin `skills/`
directories for marketplace shallow clones, then drift-checked against a single
`sources/volcano-skills` canonical submodule.

## Layout

```txt
packages/   shared libraries (reused by every plugin)
plugins/    publishable, per-IDE plugins (one directory per IDE)
```

| Workspace | Path | Description |
| --- | --- | --- |
| `@volcano-plugins/core` | `packages/core` | Shared TS helpers: base-URL resolution, CLI runner, runtime content fetcher. |
| `volcano` (VS Code) | `plugins/vscode` | VS Code extension (`.vsix` / Open VSX; also Windsurf and other vsix forks). |
| `volcano` (Cursor) | `plugins/cursor` | Cursor native plugin (`.cursor-plugin/plugin.json` + materialized skills/rules/commands). |
| `volcano` (Claude Code) | `plugins/claude-code` | Claude Code plugin (`.claude-plugin/plugin.json` + materialized skills/command); repo marketplace index at `.claude-plugin/marketplace.json`. |
| `volcano` (Claude Desktop) | `plugins/claude-desktop` | Claude Desktop Extension / MCP Bundle (`manifest.json` + local setup/instruction MCP server). |
| `volcano` (Codex) | `plugins/codex` | Codex plugin (`.codex-plugin/plugin.json` + materialized skills). |
| `volcano-skills` | `sources/volcano-skills` | Canonical Volcano agent instructions and skills, pinned as the single git submodule used for drift checks. |

Different IDEs use different plugin formats, so each gets its own target:

- **VS Code-family** (`plugins/vscode`) — `.vsix` extension. **Not Cursor.**
- **Cursor** (`plugins/cursor`) — Cursor's own plugin format
  (`.cursor-plugin/plugin.json` + rules/commands + materialized `skills`). It exposes
  canonical skills via `plugins/cursor/skills` and provides `/install-volcano`.
  No MCP yet.
- **Claude Code** (`plugins/claude-code`) — Claude Code plugin with canonical skills exposed via `plugins/claude-code/skills`, setup command `/volcano:install-volcano`, and repo marketplace index at `.claude-plugin/marketplace.json`.
- **Claude Desktop** (`plugins/claude-desktop`) — Desktop Extension / MCP Bundle scaffold with a local setup/instruction MCP server, `install-volcano` tool, and canonical skills in `plugins/claude-desktop/skills`. This is not the full Volcano MCP action surface yet.
- **Codex** (`plugins/codex`) — Codex plugin with canonical skills (including `/install-volcano`) exposed via `plugins/codex/skills` and repo marketplace entry at `.agents/plugins/marketplace.json`. No MCP yet.
- opencode — AGENTS.md + MCP config via bootstrap; no native plugin planned.

## Adding a new IDE plugin

1. Create `plugins/<ide>/` with its own plugin manifest/files.
2. If the IDE requires local skills, materialize `sources/volcano-skills` into
   `plugins/<ide>/skills` and add that path to `scripts/check-skill-drift.mjs`.
   Marketplace hosts may shallow-clone without submodules, so plugin `skills/`
   directories must be regular tracked files.
3. Depend on `@volcano-plugins/core` (`"workspace:*"`) if the plugin needs TS
   helpers for base-URL/CLI/content logic — do not re-implement them.
4. Keep it a thin shell: drive the CLI, expose/fetch/install canonical content,
   and keep origins configurable.

## Design rules (enforced in review/CI)

A plugin in this repo **must not**:

1. **Drift from canonical skills** — materialized `plugins/<ide>/skills` content
   must match `sources/volcano-skills` byte-for-byte (`pnpm check:skill-drift`).
2. **Pin stale canonical source** — `sources/volcano-skills` must point at the
   latest `volcano-skills` remote HEAD (`pnpm check:skill-submodules`).
3. **Copy canonical content outside approved skill directories** — canonical files
   may appear only under `plugins/<ide>/skills` or `sources/volcano-skills`.
4. **Re-implement a CLI command** — drive the `volcano` binary instead.
5. **Hardcode a non-overridable origin** — honor `volcano.webUrl` / `volcano.apiUrl`
   (and `VOLCANO_WEB_URL` / `VOLCANO_API_URL`) so localhost dev and prod both work.

`bootstrap.sh` + the CLI remain the permanent, advertised floor. Plugins are an
enhancement, never a prerequisite.

## Toolchain

See [CONTRIBUTING.md](./CONTRIBUTING.md) for maintenance, skills sync, validation,
and release procedures.

- Node ≥ 24, pnpm ≥ 9
- TypeScript, esbuild for extension bundling

```sh
git submodule update --init --recursive # initializes sources/volcano-skills for drift checks
pnpm install
pnpm build                       # build all packages + plugins
pnpm typecheck                   # typecheck everything
pnpm check:skill-submodules      # verify canonical source submodule is latest
pnpm sync:skills                 # refresh plugin skills from sources/volcano-skills
pnpm check:skill-drift           # verify plugin skills match canonical source
pnpm check:no-content-duplicates # verify canonical content appears only in approved skills dirs
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

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Status

- [x] Monorepo scaffold (`packages/` + `plugins/`)
- [x] `@volcano-plugins/core`
- [x] `plugins/vscode` (VS Code / vsix forks) — scaffold
- [x] `plugins/cursor` (Cursor native plugin) — scaffold (materialized skills + `/install-volcano`, no MCP)
- [x] `plugins/claude-code` (Claude Code) — scaffold (materialized skills + `/volcano:install-volcano`, no MCP)
- [x] `plugins/claude-desktop` (Claude Desktop) — scaffold (MCPB setup/instruction server + `install-volcano` tool + materialized skills)
- [x] `plugins/codex` (Codex) — scaffold (materialized skills including `/install-volcano` + repo marketplace entry, no MCP)
