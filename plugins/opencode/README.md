# Volcano for opencode

Native [opencode](https://opencode.ai) integration for Volcano.

opencode extends through files it auto-discovers rather than a compiled plugin
manifest, so this integration ships **skills only** — a materialized snapshot of
the canonical Volcano skills, including the `install-volcano` skill:

```txt
plugins/opencode/
└── skills/  # materialized from sources/volcano-skills
```

opencode loads any `skill/<name>/SKILL.md` on demand via its native `skill` tool.
It discovers skills from these locations (global shown; project equivalents also
work):

```txt
~/.config/opencode/skills/<name>/SKILL.md   # opencode-native
~/.claude/skills/<name>/SKILL.md            # Claude-compatible
~/.agents/skills/<name>/SKILL.md            # agent-compatible
```

`volcano setup` drops these skills into `~/.config/opencode/skills`, so opencode
picks them up with no further wiring. The `install-volcano` skill is
package-manager-agnostic: opencode reads it when the user asks to install or
upgrade the Volcano CLI, then follows the CLI's own installation guidance.

## Skills

`plugins/opencode/skills` is a materialized snapshot of the canonical Volcano
skills repository (`sources/volcano-skills`). opencode reads plain `SKILL.md`
files from its skills directories, so the native `skills/` directory is regular
tracked content and CI checks it against `sources/volcano-skills` byte-for-byte.

## AGENTS.md / instructions

opencode reads `AGENTS.md` for persistent instructions and supports an
`instructions` array in `opencode.json`. `~/.config/opencode/AGENTS.md` is
user-owned, so this integration does not overwrite it. To wire the canonical
Volcano instructions in explicitly, add the store copy to your config:

```jsonc
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["~/.volcano/AGENTS.md"]
}
```

## No plugin hooks or MCP yet

opencode also supports TypeScript/npm plugins (behavior hooks) and MCP servers.
This integration intentionally ships neither: Volcano's guidance is delivered as
skills, and Volcano does not currently ship an MCP action surface.
