---
name: install-volcano
description: Install or refresh the Volcano CLI, canonical agent instructions, and Volcano skills for Claude Code.
argument-hint: "[--local]"
allowed-tools: Bash, Read
---

# Install / refresh Volcano CLI and canonical skills

Use this command when the user asks to install, refresh, or set up Volcano in Claude Code.

The plugin's `skills/` directory is a plugin-local git submodule pointing at `https://github.com/Kong/volcano-skills`. The runtime installation still goes through bootstrap so the user's Claude Code environment gets `~/.volcano/AGENTS.md` and `~/.volcano/skills/*/SKILL.md`.

If the user passes `--local` or explicitly says they are developing Volcano locally, use the local web origin:

```sh
export VOLCANO_WEB_URL=http://localhost:3000 && curl -fsSL "http://localhost:3000/bootstrap.sh" -o /tmp/volcano-bootstrap.sh && sh /tmp/volcano-bootstrap.sh --apply --agent claude
```

Otherwise use production:

```sh
curl -fsSL "https://volcano.dev/bootstrap.sh" -o /tmp/volcano-bootstrap.sh && sh /tmp/volcano-bootstrap.sh --apply --agent claude
```

After bootstrap completes:

1. Verify `which volcano` succeeds.
2. Read `~/.volcano/AGENTS.md` before taking Volcano actions.
3. Use the canonical skills (`/volcano:volcano-platform`, `/volcano:volcano-sdk`, etc.) for subsequent Volcano work.
4. Prefer the `volcano` CLI for Volcano actions. Use `volcano <area> --help` and `--json` where useful.

Do not make production deploys, deletions, secret/variable changes, permission/visibility changes, custom domains, or billing/account changes without explicit user confirmation.
