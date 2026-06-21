# Volcano for Claude Code

Native Claude Code plugin for Volcano.

This plugin exposes Volcano's canonical skills without copying them:

```txt
skills -> ../../sources/volcano-skills
```

So Claude Code sees namespaced skills such as:

```text
/volcano:volcano-platform
/volcano:volcano-sdk
/volcano:volcano-functions
```

The canonical source of truth remains the `sources/volcano-skills` submodule
(`https://github.com/Kong/volcano-skills`).

The plugin also includes a local setup command:

```text
/volcano:install-volcano
```

This command installs/refreshes the runtime copy used by Claude Code sessions:

- `~/.volcano/AGENTS.md`
- `~/.volcano/skills/*/SKILL.md`

There is intentionally **no MCP config yet**; Volcano does not currently ship MCP.

## Structure

```txt
plugins/claude-code/
├── .claude-plugin/plugin.json
├── commands/
│   └── install-volcano.md
└── skills -> ../../sources/volcano-skills
```

## Local testing

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

## Symlink caveat

The plugin depends on the `sources/volcano-skills` submodule being available.
For local development, clone with submodules:

```sh
git clone --recurse-submodules <repo>
```

or initialize after clone:

```sh
git submodule update --init --recursive
```

If a marketplace/indexer does not follow symlinks into submodules, we'll need a
publish-time materialization step or a marketplace source rooted at
`volcano-skills` itself.
