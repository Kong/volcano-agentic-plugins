# volcano-agentic-plugins

Monorepo for Volcano's plugins/extensions across agentic IDEs.

These plugins are **thin shells over the Volcano CLI**. They add the
human-facing UX an editor can provide (commands, status bar, onboarding,
settings) but never re-implement Volcano's behavior. The action surface stays
the CLI; the agent content (skills, `AGENTS.md`, safety model) is **fetched at
runtime** from a configurable origin and is never bundled.

## Packages

| Package | Description |
| --- | --- |
| [`@volcano-plugins/core`](packages/core) | Shared TS helpers: base-URL resolution, CLI runner, runtime content fetcher. |
| [`@volcano-plugins/vscode`](packages/vscode-volcano) | VS Code / Cursor extension (`.vsix`). |

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
pnpm build       # build all packages
pnpm typecheck   # typecheck all packages
```

## Status

- [x] Monorepo scaffold
- [x] `@volcano-plugins/core`
- [x] `@volcano-plugins/vscode` (VS Code / Cursor) — scaffold
- [ ] Claude Code plugin (later)
