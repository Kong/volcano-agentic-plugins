# plugins/

Publishable, per-IDE plugins. One directory per IDE. Each is a thin shell over
the Volcano CLI that depends on [`@volcano-plugins/core`](../packages/core) and
follows the repo design rules (no bundled content, no reimplemented commands, no
hardcoded origin).

Each IDE uses a different plugin format, so each gets its own directory.

| Plugin | IDE(s) | Format | Status |
| --- | --- | --- | --- |
| [`vscode`](vscode) | VS Code, Windsurf, vsix/Open VSX forks | `.vsix` extension | scaffold |
| [`cursor`](cursor) | Cursor | `.cursor-plugin/plugin.json` + symlinked skills/rules/commands | scaffold |
| [`claude-code`](claude-code) | Claude Code | `.claude-plugin/plugin.json` + symlinked skills/command | scaffold |

> **Cursor is not a vsix host.** Do not point Cursor users at `vscode`.
> The Cursor plugin has no MCP config yet because Volcano does not currently ship an MCP server.
> Cursor and Claude Code plugins do not copy canonical Volcano skills; they expose `../sources/volcano-skills` by symlink.
