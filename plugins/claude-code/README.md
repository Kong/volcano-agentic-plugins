# Volcano for Claude Code

Native Claude Code plugin for Volcano.

This plugin exposes Volcano's canonical skills as tracked files so Claude Code marketplace shallow clones include them:

```txt
plugins/claude-code/skills  # materialized from sources/volcano-skills
```

So Claude Code sees namespaced skills such as:

```text
/volcano:volcano-platform
/volcano:volcano-sdk
/volcano:volcano-functions
```

The plugin also includes a local setup command:

```text
/volcano:install-volcano
```

This command installs or upgrades the Volcano CLI. The plugin already ships `AGENTS.md` and skills, so setup does not download skills into `~/.volcano/skills`.

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Structure

```txt
plugins/claude-code/
├── .claude-plugin/plugin.json
├── commands/
│   └── install-volcano.md
└── skills/  # materialized volcano-skills snapshot
```

## Local testing

Use a normal clone of this repository. Submodules are needed only for CI drift
checks, not for local Claude Code plugin loading.

Validate the plugin:

```sh
claude plugin validate plugins/claude-code
```

If your Claude Code version supports local plugin installation by path, install
`plugins/claude-code`. Otherwise use Claude Code's marketplace/local plugin flow.

## Marketplace

Anthropic's docs describe two public plugin marketplaces:

- `anthropics/claude-plugins-official` — curated by Anthropic.
- `anthropics/claude-plugins-community` — community submissions after review.

Before submitting, run:

```sh
claude plugin validate plugins/claude-code
```

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.
