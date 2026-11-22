# Workflow notes

These notes apply to this directory. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for repo procedures.

## Skills sync: how and why

- `Kong/volcano-skills` owns shared skills. `sources/volcano-skills` is the source submodule; the host `skills/` directories are generated copies. Shared changes belong upstream.
- A validated upstream main push notifies this repo. `sync-skills.yml` also has daily and manual triggers. It updates the pin, regenerates copies with `pnpm sync:skills`, validates them, and opens or updates a sync PR. It merges automatically after required checks pass.
- `ci.yml` rechecks sync after merges, refreshes the sync PR when main advances, and automatically merges validated companion fixes into PRs blocked by source drift. Draft PRs are excluded from repair so an unmerged upstream dependency is not overwritten.
- Marketplace installs can shallow-clone without submodules. Packaged skills must stay regular tracked files and match the source under the sync script's exclusions. Keep the pin and generated copies together.
- The freshness check deliberately fails when upstream advances. Removing a trigger, refresh step, or automatic merge can leave updates waiting for manual work and block validation.

## Workflow caveats

- Do not remove sync, recovery, validation, or release behavior as cleanup. Trace callers, triggers, conditions, and permissions first. Get repo-owner approval for a rule change and test its replacement. A green PR build does not exercise every event.
- Keep the required `validate` check and the merge queue disabled. Do not skip checks or change GitHub settings to make a workflow pass.
- Keep GitHub App tokens where pushes must trigger follow-on workflows. Replacing them with the default `GITHUB_TOKEN` can stop PR validation or tag-driven releases. Keep token permissions minimal and third-party actions SHA-pinned.
- Keep release builds separate from publication write access. Do not expose privileged credentials to PR-controlled code. Pass branch names, tags, and event inputs as data, not shell code.
- Preserve the immutable-tag freshness exemption for release rebuilds; recorded-pin and skill-parity checks still apply. Do not use that exemption on mutable branches.
- Keep Release Please's coordinated versions and automatic non-major releases. Major release PRs remain open for manual review.
- The public Codex ZIP reads committed `HEAD`, not the working tree. Preserve archive boundaries and exclude private local files. GitHub release artifacts do not establish publication to external marketplaces.
- Run `make validate` from the repo root. Do not weaken checks to hide a failure.
- Do not enable auto-merge or merge your own PR unless explicitly authorized. Existing sync and release automation is separate from that permission.
