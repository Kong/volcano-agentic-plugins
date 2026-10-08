# Agent notes

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, validation, packaging, and releases.

## Skills sync: how and why

- `Kong/volcano-skills` owns shared skills. `sources/volcano-skills` is the source submodule; the host `skills/` directories are generated copies. Change shared skills upstream, then sync. Do not edit the copies locally.
- A validated upstream main push notifies this repo. `.github/workflows/sync-skills.yml` also has daily and manual triggers. It updates the pin, regenerates copies with `pnpm sync:skills`, validates them, and opens or updates a sync PR. It merges automatically after the required checks pass.
- CI rechecks sync after merges, refreshes the sync PR when main advances, and automatically merges validated companion fixes into PRs blocked by source drift. Draft PRs are excluded from that repair so an unmerged upstream dependency is not overwritten.
- Marketplace installs can shallow-clone without submodules. The packaged copies must remain regular tracked files and match the source under the sync script's exclusions. Symlinks, host-local submodules, and runtime downloads break this model.
- The freshness check deliberately fails when upstream advances. Sync automation keeps main and working PRs current. Removing a trigger, refresh step, or automatic merge can leave updates waiting for manual work and block validation.

## Repo caveats

- Do not remove or disable core CI, sync, release, or safety behavior as cleanup. Trace callers, triggers, conditions, and permissions first. Get repo-owner approval for a rule change and test its replacement. A green build does not prove an event-driven process still works.
- Keep the required `validate` check and the merge queue disabled. Do not weaken checks or change GitHub settings to make a PR pass.
- Keep plugins as thin CLI integrations and preserve host formats. Cursor is not a VSIX host. Prefer local development; cloud mode needs an explicit request.
- Model-facing setup uses bundled instructions, verified exact-version installation, and normal host permissions. Reuse a working CLI. Do not restore duplicate installers, remote instruction downloads, implicit upgrades, or tool pre-approval.
- The public Codex ZIP reads committed `HEAD`, not the working tree. Commit intended content before packaging. Keep its file allowlist and rejection of symlinks and submodules; never include private local files.
- Keep third-party actions SHA-pinned and token permissions minimal. Keep release builds separate from publication write access. Do not expose privileged credentials to PR-controlled code.
- Preserve the immutable-tag freshness exemption for release rebuilds; recorded-pin and skill-parity checks still apply. Do not use that exemption on a branch to bypass stale-source failures.
- Keep host versions coordinated through Release Please. The Codex submission version override changes the ZIP only. Keep plugin descriptions aligned with catalogue entries; the collection description is separate. Use official artwork and supported metadata fields.
- Verify actual execution and data flow before treating documentation examples or public application keys as credential collection.
- A source push, GitHub release, or local ZIP does not publish to every marketplace. Report publication only when verified.
- Run `make validate` and check the final diff. Do not add unrelated changes or hide a failed check.
- Leave review PRs open. Do not post comments, enable auto-merge, merge, publish, or change repo rules unless explicitly authorized. Existing sync automation is separate from permission to merge your own PR.
