# Volcano for Claude Desktop

Claude Desktop uses **Desktop Extensions / MCP Bundles** (`.mcpb`) for local tool integrations. This plugin is a lightweight Desktop Extension scaffold for Volcano.

It intentionally does **not** implement the full Volcano MCP action surface yet. Instead, it exposes setup/instruction tools while the Volcano CLI remains the action path.

## Components

```txt
plugins/claude-desktop/
├── manifest.json
├── server/
│   └── index.js
└── skills/  # materialized from sources/volcano-skills
```

## Tools exposed to Claude Desktop

| Tool | Purpose |
| --- | --- |
| `install-volcano` | Alias returning the bundled `skills/install-volcano/SKILL.md`. |
| `volcano_setup_instructions` | Returns the same bundled setup skill; reports an error if it is missing. |
| `volcano_agent_instructions` | Returns canonical `AGENTS.md` from the packaged `skills/` directory. |
| `volcano_skill_index` | Lists canonical Volcano skills from the packaged `skills/` directory. |

## User config

The extension does not require user configuration. It ships Volcano instructions and skills in the MCPB. Both setup tools return instructions; they do not execute the installer.

Follow the bundled setup skill through an approved terminal workflow. Setup reuses a working CLI. Installation or an explicit upgrade uses a verified, exact npm version with normal host permissions. If terminal access is unavailable, use the official [CLI documentation](https://docs.volcano.dev/cli) and your trusted software-management process.

Setup does not download replacement instructions, change global agent guidance, or patch shell startup files. A missing setup skill requires reinstalling the extension package. Skill sync replaces the bundled skill without replacing these tool entrypoints.

## Local test

Use a normal clone of this repository. The extension packages materialized
`skills/` files, so marketplace installs do not require submodules.

Smoke-test the stdio MCP server:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node plugins/claude-desktop/server/index.js
```

## Package

Claude Desktop extensions are packaged as MCP Bundles (`.mcpb`) using Anthropic's `mcpb`/DXT tooling.

Example (once the CLI is installed):

```sh
cd plugins/claude-desktop
mcpb pack
```

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.
