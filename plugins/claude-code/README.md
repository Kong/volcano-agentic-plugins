# Volcano for Claude Code

Native Claude Code plugin for Volcano.

This plugin is intentionally **pointer-only**:

- It does **not** copy Volcano's canonical `SKILL.md` files.
- It does **not** copy `AGENTS.md` / `CLAUDE.md`.
- It does **not** include MCP config yet; Volcano does not currently ship MCP.

Instead, it provides one namespaced Claude Code skill:

```text
/volcano:install-volcano
```

That skill installs/refreshes the canonical runtime source:

- `~/.volcano/AGENTS.md`
- `~/.volcano/skills/*/SKILL.md`

The canonical source of truth is the `sources/volcano-skills` submodule
(`https://github.com/Kong/volcano-skills`).

## Structure

```txt
plugins/claude-code/
├── .claude-plugin/plugin.json
└── skills/
    └── install-volcano/
        └── SKILL.md
```

Claude Code plugin skills are namespaced by plugin name, so the skill is invoked
as:

```text
/volcano:install-volcano
```

## Local testing

Claude Code plugins can be tested locally from a plugin directory. From this
repo, run Claude Code's plugin validator if available:

```sh
claude plugin validate plugins/claude-code
```

Then install via Claude Code's local/plugin flow (or add this plugin repo to a
marketplace once published). If your Claude Code version supports local plugin
installation by path, install `plugins/claude-code`.

## Marketplace

Anthropic's docs describe two public plugin marketplaces:

- `anthropics/claude-plugins-official` — curated by Anthropic.
- `anthropics/claude-plugins-community` — community submissions after review.

Before submitting, run:

```sh
claude plugin validate plugins/claude-code
```

## Why no embedded Volcano skills?

A Claude Code plugin can embed `skills/*/SKILL.md`, but doing so would duplicate
canonical content and drift as we add plugins for more IDEs. The monorepo rule is:
**canonical content lives once in `sources/volcano-skills`; plugin directories are
adapters that point at it.**
