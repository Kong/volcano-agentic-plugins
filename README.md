# Volcano Agentic Plugins

Volcano plugins and extensions for agentic IDEs and coding assistants.

Volcano integrates natively with VS Code-family editors, Cursor, Claude Code,
Claude Desktop, and Codex. Each plugin is a thin integration layer that delivers
host-native UX, commands, and packaged skills while delegating all runtime
behavior to the `volcano` CLI — plugins do not reimplement Volcano features.

## Supported hosts

| Host | Path | Format | Notes |
| --- | --- | --- | --- |
| VS Code-family editors | [`plugins/vscode`](./plugins/vscode) | VSIX extension | For VS Code, Open VSX, Windsurf, and other VSIX-compatible editors. Cursor is not a VSIX host. |
| Cursor | [`plugins/cursor`](./plugins/cursor) | Cursor plugin | Uses `.cursor-plugin/plugin.json`, rules, commands, and materialized `skills/`. |
| Claude Code | [`plugins/claude-code`](./plugins/claude-code) | Claude Code plugin | Uses `.claude-plugin/plugin.json`; repo marketplace index is [`./.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json). |
| Claude Desktop | [`plugins/claude-desktop`](./plugins/claude-desktop) | MCP Bundle / Desktop Extension | Provides setup and instruction tools; not the full Volcano MCP action surface. |
| Codex | [`plugins/codex`](./plugins/codex) | Codex plugin | Repo marketplace index is [`./.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json). |

## Install artifacts

GitHub Releases publish the packaged artifacts used by web install CTAs:

```txt
https://github.com/Kong/volcano-agentic-plugins/releases/latest/download/volcano-vscode.vsix
https://github.com/Kong/volcano-agentic-plugins/releases/latest/download/volcano-claude-desktop.mcpb
```

Marketplace-style manifests are included for hosts that discover plugins from a
repository:

- Claude Code: [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)
- Cursor: [`.cursor-plugin/marketplace.json`](./.cursor-plugin/marketplace.json)
- Codex: [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)

## Repository layout

```txt
.github/workflows/      CI and release packaging
.agents/plugins/        Codex marketplace manifest
.claude-plugin/         Claude Code marketplace manifest
.cursor-plugin/         Cursor marketplace manifest
packages/core/          Shared TypeScript helpers
plugins/                Per-host plugin packages
sources/volcano-skills/ Canonical Volcano skills submodule used for drift checks
scripts/                Validation and sync scripts
```

## Canonical skills model

Marketplace hosts may shallow-clone plugin repositories without initializing git
submodules. For that reason, each plugin that needs local skills stores a
materialized, tracked copy under `plugins/<host>/skills`.

`sources/volcano-skills` remains the canonical source submodule. CI verifies
that all materialized plugin skill directories match the canonical source
byte-for-byte.

To refresh packaged skills after `volcano-skills` changes:

```sh
git submodule update --remote sources/volcano-skills
pnpm sync:skills
make test
```

## Development

Requirements:

- Node 24+
- pnpm 10.x

Setup:

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

Run the main repository checks:

```sh
make test
```

Run full local validation, including host validators and package builds:

```sh
make validate
```

Package release artifacts locally:

```sh
make package
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full maintenance, validation,
shallow-clone smoke-test, and release workflow.

## Release process

Releases are tag-driven. Pushing a `v*` tag runs the `Release plugin artifacts`
workflow, which validates the repository and publishes:

- `volcano-vscode.vsix`
- `volcano-claude-desktop.mcpb`

The workflow publishes GitHub Release assets only. External marketplace
submission remains host-specific.

## Design principles

- Keep plugins thin; drive the Volcano CLI rather than duplicating CLI logic.
- Use `install-volcano` as the canonical install/upgrade entrypoint.
- Keep canonical skill content aligned with `sources/volcano-skills`.
- Store plugin skills as tracked files for shallow-clone compatibility.
- Keep host-specific plugin formats separate; do not reuse VSIX packaging for
  Cursor.
- Keep local development defaults local (`volcano ...`), not cloud
  (`volcano cloud ...`), unless cloud mode is explicitly requested.

## License

Apache-2.0. See [LICENSE](./LICENSE).
