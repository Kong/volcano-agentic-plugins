---
name: install-volcano
description: Install or refresh the Volcano CLI, canonical agent instructions, and Volcano skills for Claude Code.
argument-hint: "[--local]"
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Install / refresh Volcano CLI and canonical skills

Use this skill when the user asks to install, refresh, or set up Volcano in Claude Code.

This plugin intentionally does **not** embed Volcano's canonical skills or safety instructions. Canonical content lives in one place:

- Runtime install: `~/.volcano/AGENTS.md` and `~/.volcano/skills/*/SKILL.md`
- Source of truth: `sources/volcano-skills` / `https://github.com/Kong/volcano-skills`
- Default web origin: `https://volcano.dev`

## Procedure

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
3. Use the canonical skills in `~/.volcano/skills/` (`volcano-platform`, `volcano-sdk`, `volcano-functions`, etc.) for subsequent Volcano work.
4. Prefer the `volcano` CLI for Volcano actions. Use `volcano <area> --help` and `--json` where useful.

## Safety

Follow the safety model in `~/.volcano/AGENTS.md`. In particular, production deploys, deletions, secret/variable changes, permission/visibility changes, custom domains, and billing/account changes require explicit user confirmation.
