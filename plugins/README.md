# plugins/

Publishable, per-IDE plugins. One directory per IDE. Each is a thin shell over
the Volcano CLI and follows the repo design rules: materialized canonical skills
must not drift from `sources/volcano-skills`, commands are not reimplemented, and
origins are not hardcoded.

Each IDE uses a different plugin format, so each gets its own directory.

| Plugin | IDE(s) | Format | Status |
| --- | --- | --- | --- |
| [`vscode`](vscode) | VS Code, Windsurf, vsix/Open VSX forks | `.vsix` extension | scaffold |
| [`cursor`](cursor) | Cursor | `.cursor-plugin/plugin.json` + materialized skills/rules/commands | scaffold |
| [`claude-code`](claude-code) | Claude Code | `.claude-plugin/plugin.json` + materialized skills/command | scaffold |
| [`claude-desktop`](claude-desktop) | Claude Desktop | MCP Bundle / Desktop Extension (`manifest.json`) + local setup/instruction server | scaffold |
| [`codex`](codex) | Codex | `.codex-plugin/plugin.json` + materialized skills | scaffold |

> **Cursor is not a vsix host.** Do not point Cursor users at `vscode`.
> Cursor and Claude Code plugins have no full MCP action surface yet because Volcano does not currently ship one.
> Claude Desktop necessarily uses an MCP Bundle shape, but its server exposes only setup/instruction tools for now.
> Cursor, Claude Code, Claude Desktop, and Codex plugin hosts may shallow-clone without submodules, so their `skills/` directories are regular tracked files. CI keeps them byte-for-byte aligned with `sources/volcano-skills`.
