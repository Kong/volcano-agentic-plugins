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

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

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
