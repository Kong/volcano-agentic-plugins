# volcano-agentic-plugins

Monorepo for Volcano's plugins/extensions across agentic IDEs.

These plugins are **thin shells over the Volcano CLI**. They add the
human-facing UX an editor can provide (commands, status bar, onboarding,
settings) but never re-implement Volcano's behavior. The action surface stays
the CLI; the agent content (skills, `AGENTS.md`, safety model) is **fetched at
runtime** from a configurable origin and is never bundled.

## Layout

```
packages/   shared libraries (reused by every plugin)
plugins/    publishable, per-IDE plugins (one directory per IDE)
```

| Workspace | Path | Description |
| --- | --- | --- |
| `@volcano-plugins/core` | `packages/core` | Shared TS helpers: base-URL resolution, CLI runner, runtime content fetcher. |
| `volcano` (VS Code) | `plugins/vscode` | VS Code extension (`.vsix` / Open VSX; also Windsurf and other vsix forks). |
| `volcano` (Cursor) | `plugins/cursor` | Cursor native plugin (`.cursor-plugin/plugin.json` + rules/skills). |
| `volcano-skills` | `sources/volcano-skills` | Git submodule backing Cursor plugin skills/rules generation. |

Different IDEs use different plugin formats, so each gets its own target:

- **VS Code-family** (`plugins/vscode`) — `.vsix` extension. **Not Cursor.**
- **Cursor** (`plugins/cursor`) — Cursor's own plugin format
  (`.cursor-plugin/plugin.json` + rules/skills, marketplace). No MCP yet.
- **Claude Code** (`plugins/claude-code`, planned) — Claude Code plugin.
- Codex / opencode — AGENTS.md + MCP config via bootstrap; no native plugin planned.

## Adding a new IDE plugin

1. Create `plugins/<ide>/` with its own `package.json` (workspace member).
2. Depend on `@volcano-plugins/core` (`"workspace:*"`) for base-URL/CLI/content
   logic — do not re-implement it.
3. Keep it a thin shell: drive the CLI, fetch content at runtime, expose a
   configurable base URL.

## Design rules (enforced in review)

A plugin in this repo **must not**:

1. **Bundle content** — skills, `AGENTS.md`, command surface, or safety text.
   Fetch it at runtime from the configured base URL.
2. **Re-implement a CLI command** — drive the `volcano` binary instead.
3. **Hardcode a non-overridable origin** — honor `volcano.webUrl` / `volcano.apiUrl`
   (and `VOLCANO_WEB_URL` / `VOLCANO_API_URL`) so localhost dev and prod both work.

`bootstrap.sh` + the CLI remain the permanent, advertised floor. Plugins are an
enhancement, never a prerequisite.

## Toolchain

- Node ≥ 20 (Node 24 recommended), pnpm ≥ 9
- TypeScript, esbuild for extension bundling

```sh
pnpm install
pnpm build       # build all packages + plugins
pnpm typecheck   # typecheck everything
pnpm sync:cursor # regenerate plugins/cursor from sources/volcano-skills
```

## Status

- [x] Monorepo scaffold (`packages/` + `plugins/`)
- [x] `@volcano-plugins/core`
- [x] `plugins/vscode` (VS Code / vsix forks) — scaffold
- [x] `plugins/cursor` (Cursor native plugin) — scaffold (rules + skills, no MCP)
- [ ] `plugins/claude-code` (Claude Code) — later
