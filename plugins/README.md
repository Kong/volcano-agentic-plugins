# plugins/

Publishable, per-IDE plugins. One directory per IDE. Each is a thin shell over
the Volcano CLI that depends on [`@volcano-plugins/core`](../packages/core) and
follows the repo design rules (no bundled content, no reimplemented commands, no
hardcoded origin).

Each IDE uses a different plugin format, so each gets its own directory.

| Plugin | IDE(s) | Format | Status |
| --- | --- | --- | --- |
| [`vscode`](vscode) | VS Code, Windsurf, vsix/Open VSX forks | `.vsix` extension | scaffold |
| `cursor` | Cursor | `.cursor-plugin/plugin.json` (rules/skills/commands/hooks/MCP) | planned |
| `claude-code` | Claude Code | Claude Code plugin | planned |

> **Cursor is not a vsix host.** Do not point Cursor users at `vscode`.
