# plugins/

Publishable, per-IDE plugins. One directory per IDE. Each is a thin shell over
the Volcano CLI that depends on [`@volcano-plugins/core`](../packages/core) and
follows the repo design rules (no bundled content, no reimplemented commands, no
hardcoded origin).

| Plugin | IDE(s) | Status |
| --- | --- | --- |
| [`vscode`](vscode) | VS Code, Cursor | scaffold |
| `claude-code` | Claude Code | planned |
