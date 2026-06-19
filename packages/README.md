# packages/

Shared libraries reused across the per-IDE plugins in [`../plugins`](../plugins).

Code here must stay IDE-agnostic — no `vscode`, Claude Code, or other
host-specific APIs. Host-specific glue belongs in the individual plugin.

| Package | Description |
| --- | --- |
| [`core`](core) | `@volcano-plugins/core` — base-URL resolution, CLI runner, runtime content fetcher. |
