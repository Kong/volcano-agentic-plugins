# Volcano for Claude Code

Native Claude Code plugin for Volcano.

This plugin exposes Volcano's canonical skills as tracked files so Claude Code marketplace shallow clones include them:

```txt
plugins/claude-code/skills  # materialized from sources/volcano-skills
```

So Claude Code sees namespaced skills such as:

```text
/volcano:volcano-platform
/volcano:volcano-sdk
/volcano:volcano-functions
```

Use the bundled setup skill:

```text
/volcano:install-volcano
```

Setup reuses a working Volcano CLI. Installation or an explicit upgrade uses one exact npm package version, verifies its official repository and integrity metadata, and checks the resulting CLI version. Setup stops if verification fails. There is no separate shell installer or unchecked fallback.

## Setup, data, and permissions

- Instructions stay in the plugin. Setup does not download replacement instructions, copy global agent guidance, edit global `CLAUDE.md`, or patch shell startup files. This is the same for every marketplace.
- CLI installation uses `@volcano.dev/cli` from `https://registry.npmjs.org`. The package downloads the matching binary from `https://github.com/Kong/volcano-cli` and verifies its checksum. npm writes the package and executable to its global installation directory and cache. Setup clears release-source overrides for each CLI invocation and npm install.
- Skills can run the CLI, write application files, and start or deploy to local services for a requested build. Cloud deployment, deletion, credential changes, and permission changes require explicit approval. Approved cloud commands can send application code, configuration, and data to Volcano services. CLI sign-in uses human-approved device authorization.
- The plugin has no MCP server, automatic hooks, or bundled executable. If bundled skills are missing, report the missing plugin files instead of fetching new instructions. Reference documentation is available at `https://docs.volcano.dev`.

Privacy: [Volcano Privacy Policy](https://volcano.dev/privacy). Support and security questions: [support@volcano.dev](mailto:support@volcano.dev).

## Example prompts

- Build a personal notes app with email sign-in and per-user data using Volcano.
- Build a collaborative todo board with realtime updates using Volcano.
- Build a QR code generator using Volcano Functions.

## Structure

```txt
plugins/claude-code/
├── .claude-plugin/plugin.json
└── skills/  # materialized volcano-skills snapshot, including install-volcano
```

## Local testing

Use a normal clone of this repository. Submodules are needed only for CI drift
checks, not for local Claude Code plugin loading.

Validate the plugin:

```sh
claude plugin validate plugins/claude-code
```

Load the plugin in a local session:

```sh
claude --plugin-dir plugins/claude-code
```

## Marketplace

Anthropic's docs describe two public plugin marketplaces:

- `anthropics/claude-plugins-official` — curated by Anthropic.
- `anthropics/claude-plugins-community` — community submissions after review.

Before submitting, run:

```sh
claude plugin validate plugins/claude-code
```

## Drift caveat

When canonical Volcano skills change, refresh `sources/volcano-skills`, run
`pnpm sync:skills`, then run `pnpm check:skill-drift`.
