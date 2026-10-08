# Repository agent instructions

These instructions apply to agents that maintain this repository. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, validation, packaging, and release procedures.

## Before a change

- Confirm the repository, target branch, worktree status, and PR before acting. Read existing changes before switching branches or discarding work.
- Read the affected code, callers, tests, workflow triggers, job conditions, and permissions. Do not call a process unused without checking its callers and runtime conditions.
- State the objective, affected files, excluded work, and verification command. Keep each PR at one ownership boundary.
- Reuse existing helpers and checks. Do not add unrelated cleanup or speculative abstractions.
- Support claims about existing behavior with commands run against the target branch. Mark unverified claims as unverified.

## Core rule changes

- Preserve the rules below in ordinary feature, dependency, metadata, and cleanup PRs.
- Get explicit repo-owner approval before changing a core rule. Use a separate PR that states the existing behavior, proposed behavior, affected consumers, and verification.
- If replacing a core process, provide a working replacement and tests that preserve its required behavior. Do not remove the process on the basis of a green build alone.
- Do not weaken a check, delete coverage, skip a job, or suppress a failure to make a PR pass.
- Changes to this file or the repository invariants in `CONTRIBUTING.md` need the same approval.

## CI and automation

Preserve these processes and their behavior, not just their job names.

| Process | Files | Required behavior |
| --- | --- | --- |
| PR validation | `.github/workflows/ci.yml`, `Makefile`, validation scripts | Check source freshness, materialized skill parity, duplicate content, setup safety, metadata, archive boundaries, host behavior, and builds. |
| Skills sync | `.github/workflows/sync-skills.yml` | Handle upstream notifications, scheduled runs, and manual runs. Update the canonical pin, regenerate tracked skills, validate them, and open or update the sync PR. |
| Sync recovery | `.github/workflows/ci.yml` | Keep the post-merge recheck, sync-PR refresh after main advances, and repair of PRs blocked by source drift. Preserve the draft-PR exception and failure reporting. |
| Releases | `.github/workflows/release-please.yml`, `.github/workflows/release.yml` | Keep coordinated version updates, validation before publication, and the build/publish permission boundary. |

- Trace cross-repository triggers before changing event names, payloads, conditions, or target branches. The upstream skills notification and this repo's sync workflow must remain compatible.
- Keep the required `validate` check. Do not rename or remove it without an approved update to its consumers and branch rules.
- Keep the merge queue disabled. Do not restore it or bypass required checks.
- Do not change GitHub rules, reviewer requirements, automation permissions, or secrets without explicit repo-owner authorization.
- Keep third-party actions pinned to full commit SHAs. Resolve the version and update all affected occurrences when changing an action.
- Keep sync and release automation working without manual approval for ordinary generated updates. Do not add a broad approval gate that blocks those updates.
- Add a runnable behavior check when changing a core process. Cover the failure path; checking that a job name exists is not enough.

## Canonical skills and plugin boundaries

- Keep `sources/volcano-skills` as the only skills submodule, pointing at `Kong/volcano-skills`.
- Make shared skill changes in `Kong/volcano-skills`, then update the pin and run `pnpm sync:skills`. Do not edit generated plugin skills locally.
- Keep materialized `plugins/<host>/skills` as regular tracked files. They must match the source under the sync script's exclusion rules and work in shallow clones without submodule initialization.
- Do not replace materialized skills with symlinks, host-local submodules, or runtime downloads.
- Keep source freshness checks active on PRs and mutable branches. Preserve the immutable-tag release exemption without weakening recorded-pin or skill-parity checks.
- Keep plugins as thin host integrations over the Volcano CLI. Do not duplicate platform behavior or canonical skill content.
- Preserve each host's package format and entrypoints. Cursor is not a VSIX host.
- Keep local development guidance local. Use cloud mode only when explicitly requested.

## Setup and security

- Keep model-facing setup on bundled instructions. Missing bundled instructions must stop setup and request package reinstallation.
- Do not restore removed installer copies or download replacement behavioral instructions.
- Preserve exact-version installation, official package provenance, and integrity checks in the bundled setup skill. Reuse a working CLI without an implicit upgrade.
- Preserve normal host tool permissions. Do not add tool pre-approval or bypass permission prompts.
- Do not commit credentials or include private local files in artifacts. Public application-key examples are not proof of secret collection; verify the actual data flow before changing them.
- Use the minimum token permissions needed. Keep dependency installation and release builds separate from the job with publication write access.
- Do not execute PR-controlled code with privileged workflow credentials. Treat branch names, input tags, and event data as data, not shell code.
- Do not let workspace content silently replace trusted installed instructions or machine-scoped executable and endpoint settings.

## Packaging, metadata, and releases

- Preserve the public Codex packager's committed-`HEAD` boundary and file allowlist. Do not include worktree edits, untracked files, symlinks, submodules, or unrelated repo content in the public ZIP.
- Keep archive path checks, package-isolation tests, host validators, and smoke checks active.
- Use official Volcano artwork. Add only metadata fields supported by the host schema or verified marketplace behavior.
- Keep repository and host versions coordinated through the release process. Preserve the separate public Codex submission version override.
- Keep Claude Code, Codex, and Cursor plugin descriptions consistent with their catalogue entries. The marketplace collection description is separate.
- Publish only validated committed content. Do not move or delete published production tags to repair a release.
- A source push, GitHub release, or local ZIP is not proof of marketplace publication. Report each publication step by its verified state.

## Verification and delivery

- Use Node 24 and the pnpm version declared in `package.json`. Initialize the source submodule before checks.
- Run the smallest relevant regression check. Run `make validate` before requesting merge; report a blocked or unavailable check accurately.
- If source freshness fails, resolve the canonical source dependency through the sync process. Do not set the release-only exemption to make a branch pass.
- Inspect `git diff --check` and `git diff --name-only <base>...HEAD`. Remove changes outside the requested scope.
- Resolve conflicts with rebase. Preserve current release versions and approved content. Push rewritten history with an exact `--force-with-lease` guard.
- Commit completed work with a single-line Conventional Commit message and no co-author trailers.
- Use the `Tracking`, `Why`, `Summary`, and `Verification` PR format in that order. Omit `Tracking` when no relevant link exists. List only verification commands actually run.
- Do not post GitHub comments, submit reviews, enable auto-merge, merge PRs, publish artifacts, or accept publisher terms unless explicitly authorized. A request to open a PR is not permission to merge it.
- If required checks have not appeared, check PR mergeability and workflow state before waiting. Fix conflicts before waiting for CI.
- Leave the PR open for review when requested. Do not change repo settings to bypass that review.

This file gives agent instructions. It does not configure GitHub approval rules or required checks.
