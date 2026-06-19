# Volcano for VS Code & Cursor

The Volcano extension for VS Code-family editors (including Cursor). It is a
**thin shell over the Volcano CLI** — it adds editor UX (commands, a status
bar, onboarding) and **fetches agent content at runtime**; it bundles no
skills, `AGENTS.md`, or safety text.

## Commands

| Command | What it does |
| --- | --- |
| `Volcano: Start Building` | Quick menu: open the guide, bootstrap, or log in. |
| `Volcano: Log In` | Runs `volcano login` (device flow) in a terminal. |
| `Volcano: Status` | Runs `volcano status` and prints to the Volcano output channel. |
| `Volcano: Install CLI & Skills (Bootstrap)` | Runs the bootstrap script from the configured origin. |
| `Volcano: Show Agent Instructions (AGENTS.md)` | Fetches `AGENTS.md` live from the configured origin. |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `volcano.webUrl` | `https://volcano.dev` | Origin for docs/skills/`AGENTS.md`. Set `http://localhost:3000` for dev. |
| `volcano.apiUrl` | _(empty)_ | Non-prod API URL for the CLI (e.g. `http://localhost:8000`). |
| `volcano.cliPath` | `volcano` | Path to the CLI binary. |

Settings override the `VOLCANO_WEB_URL` / `VOLCANO_API_URL` environment
variables, which override the production default.

## Develop

```sh
pnpm install
pnpm --filter volcano watch     # bundle in watch mode
pnpm --filter volcano typecheck
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

## Package

```sh
pnpm --filter volcano package   # produces volcano.vsix
```

> TODO: add `media/icon.png` and re-enable the `icon` manifest field before publishing.
