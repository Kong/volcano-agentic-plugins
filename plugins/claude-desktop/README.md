# Volcano for Claude Desktop

Claude Desktop uses **Desktop Extensions / MCP Bundles** (`.mcpb`) for local tool integrations. This plugin is a lightweight Desktop Extension scaffold for Volcano.

It intentionally does **not** implement the full Volcano MCP action surface yet. Instead, it exposes setup/instruction tools while the Volcano CLI remains the action path.

## Components

```txt
plugins/claude-desktop/
├── manifest.json
├── server/
│   └── index.js
└── skills/  # git submodule: https://github.com/kong/volcano-skills.git
```

## Tools exposed to Claude Desktop

| Tool | Purpose |
| --- | --- |
| `install-volcano` | One-step alias returning the Volcano CLI install/upgrade command. |
| `volcano_setup_instructions` | Returns the CLI install/upgrade command. This does not download skills into `~/.volcano/skills`. |
| `volcano_agent_instructions` | Returns canonical `AGENTS.md` from the `skills` submodule. |
| `volcano_skill_index` | Lists canonical Volcano skills from the `skills` submodule. |

## User config

The extension manifest exposes:

| Config | Default | Purpose |
| --- | --- | --- |
| `web_url` | `https://volcano.dev` | Origin for Volcano bootstrap/docs/skills. Use `http://localhost:3000` for local Volcano web development. |

## Local test

Initialize submodules:

```sh
git submodule update --init --recursive
```

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

## Submodule caveat

The extension depends on `plugins/claude-desktop/skills` being initialized. If a Desktop Extension packager or marketplace path does not include submodules automatically, package from a clone where submodules are initialized or add a publish-time materialization step.
