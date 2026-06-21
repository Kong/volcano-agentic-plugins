---
name: install-volcano
description: Install or refresh the Volcano CLI, canonical agent instructions, and Volcano skills
---

# Install / refresh Volcano CLI and canonical skills

Use this command when the user asks to install, refresh, or set up Volcano in Cursor.

Run the canonical bootstrap script. Use the production origin unless the user explicitly says they are developing Volcano locally.

Production:

```sh
curl -fsSL "https://volcano.dev/bootstrap.sh" -o /tmp/volcano-bootstrap.sh && sh /tmp/volcano-bootstrap.sh --apply --agent cursor
```

Local Volcano web development:

```sh
export VOLCANO_WEB_URL=http://localhost:3000 && curl -fsSL "http://localhost:3000/bootstrap.sh" -o /tmp/volcano-bootstrap.sh && sh /tmp/volcano-bootstrap.sh --apply --agent cursor
```

After bootstrap completes:

1. Verify `which volcano` succeeds.
2. Read `~/.volcano/AGENTS.md`.
3. Use skills from `~/.volcano/skills/` for subsequent Volcano work.

Do not make production deploys, deletions, secret/variable changes, permission/visibility changes, custom domain changes, or billing/account changes without explicit user confirmation.
