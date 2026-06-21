# plugins/

Publishable, per-IDE plugins. One directory per IDE. Each is a thin shell over
the Volcano CLI and follows the repo design rules: no copied canonical content,
no reimplemented commands, and no hardcoded origin.

Each IDE uses a different plugin format, so each gets its own directory.

| Plugin | IDE(s) | Format | Status |
| --- | --- | --- | --- |
| [`vscode`](vscode) | VS Code, Windsurf, vsix/Open VSX forks | `.vsix` extension | scaffold |
| [`cursor`](cursor) | Cursor | `.cursor-plugin/plugin.json` + skills submodule/rules/commands | scaffold |
| [`claude-code`](claude-code) | Claude Code | `.claude-plugin/plugin.json` + skills submodule/command | scaffold |
| [`claude-desktop`](claude-desktop) | Claude Desktop | MCP Bundle / Desktop Extension (`manifest.json`) + local setup/instruction server | scaffold |

> **Cursor is not a vsix host.** Do not point Cursor users at `vscode`.
> Cursor and Claude Code plugins have no full MCP action surface yet because Volcano does not currently ship one.
> Claude Desktop necessarily uses an MCP Bundle shape, but its server exposes only setup/instruction tools for now.
> Cursor, Claude Code, and Claude Desktop plugins do not copy canonical Volcano skills; they vendor `volcano-skills` as plugin-local `skills` submodules.
