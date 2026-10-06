# Volcano for Codex

Native Codex plugin for Volcano.

Codex plugins use `.codex-plugin/plugin.json` and can include `skills/`, hooks,
apps/connectors, and MCP config. This plugin currently ships **skills only**, including the canonical `/install-volcano` skill:

```txt
plugins/codex/
├── .codex-plugin/plugin.json
└── skills/  # materialized from sources/volcano-skills
```

Use `/install-volcano` in Codex to install or upgrade the Volcano CLI. The plugin already ships `AGENTS.md` and skills, so this command does not download skills into `~/.volcano/skills`.

This package is **skills only** and includes no MCP configuration. Volcano has a
separate token-authenticated MCP service; connecting it through a public plugin
is separate work and is not part of this package.

## Skills

`plugins/codex/skills` is a materialized snapshot of the canonical Volcano
skills repository. Codex marketplace/indexer paths may shallow-clone without
submodules, so the native `skills/` directory is regular tracked content and CI
checks it against `sources/volcano-skills`.

## Local/repo marketplace

Codex supports repo-scoped plugin marketplaces at:

```txt
.agents/plugins/marketplace.json
```

This repo has one that points at `plugins/codex`.

From this repo, add the repo as a local marketplace and then add the Volcano plugin from that marketplace:

```sh
codex plugin marketplace add ./
codex plugin add volcano@volcano-agentic-plugins
```

Or add the marketplace from GitHub:

```sh
codex plugin marketplace add Kong/volcano-agentic-plugins --ref main
codex plugin add volcano@volcano-agentic-plugins
```

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.

## Public plugin package

The Codex manifest is the source of truth for public listing, review and
publication metadata. Generate the portable Agent Plugins manifest and matching
Codex compatibility manifest together, with bundled skills, assets and license:

```sh
pnpm package:codex
# Explicit submission revision, without changing the repository release:
pnpm package:codex --version 0.2.25
```

The ZIP is written to `dist/volcano-<version>-public.zip` with `plugin.json` at its
root. Packaging requires Node and `zip`; it does not install or execute the CLI.
CLI setup reuses an installed working version. Installation or a requested upgrade
uses an exact official npm version with provenance and integrity checks.

The first public submission was derived from repository release 0.2.23. Its
0.2.24 and 0.2.25 numbers were submission revisions, not repository, CLI or SDK
releases. The repository keeps its coordinated release version; pass the next
public submission version explicitly when it differs. Update release notes in
`.codex-plugin/plugin.json` before each submission. The historical 0.2.25 ZIP is
not byte-identical to a new build: the shared prerequisites now also remove
leftover implicit plugin-update instructions.

For updates: change canonical skills in `Kong/volcano-skills`, merge them there,
refresh the submodule and materialized skills, update listing/release notes,
validate, generate the ZIP, and upload it to the existing public plugin entry.
Publishing on GitHub does not itself upload or publish the OpenAI listing.
The countries list is deliberately empty for all available countries/regions;
commerce is false because the plugin does not process purchases.

Public packaging reads the committed `HEAD` tree, including its manifest, rather
than recursively copying the working directory. Commit intended content changes
before packaging; ignored, untracked, staged-only and unstaged edits are excluded.
Symlinks and submodules inside package content are rejected. Run
`pnpm check:codex-package` for the local-secret and version-override regression
checks (`git`, `zip` and `unzip` are required). This check also runs in CI.
