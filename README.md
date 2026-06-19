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
| `volcano` (VS Code/Cursor) | `plugins/vscode` | VS Code-family extension (`.vsix`), also installs in Cursor. |

Planned plugins (not yet built): `plugins/claude-code` (Claude Code plugin),
and thin config wrappers for Codex / opencode if they ever justify it.

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
```

## Status

- [x] Monorepo scaffold (`packages/` + `plugins/`)
- [x] `@volcano-plugins/core`
- [x] `plugins/vscode` (VS Code / Cursor) — scaffold
- [ ] `plugins/claude-code` (Claude Code) — later
