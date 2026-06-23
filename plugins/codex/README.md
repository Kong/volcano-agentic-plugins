# Volcano for Codex

Native Codex plugin for Volcano.

Codex plugins use `.codex-plugin/plugin.json` and can include `skills/`, hooks,
apps/connectors, and MCP config. This plugin currently ships **skills only**, including the canonical `/install-volcano` skill:

```txt
plugins/codex/
├── .codex-plugin/plugin.json
└── skills/  # git submodule: https://github.com/kong/volcano-skills.git
```

Use `/install-volcano` in Codex to install or upgrade the Volcano CLI. The plugin already ships `AGENTS.md` and skills, so this command does not download skills into `~/.volcano/skills`.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Skills

`plugins/codex/skills` is a plugin-local git submodule pointing at the canonical
Volcano skills repository. This avoids copying `SKILL.md` files across IDE
plugins while still giving Codex a native `skills/` directory.

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

## Submodule caveat

The plugin depends on `plugins/codex/skills` being initialized. Use:

```sh
git submodule update --init --recursive
```

If a marketplace/indexer does not clone submodules, we'll need a publish-time
materialization step or a marketplace source rooted at `volcano-skills` itself.
