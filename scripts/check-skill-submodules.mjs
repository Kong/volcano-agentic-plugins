import { execFileSync } from "node:child_process";
import process from "node:process";

const SOURCE_PATH = "sources/volcano-skills";
const CANONICAL_URL = "https://github.com/Kong/volcano-skills.git";
const PLUGIN_SKILL_PATHS = [
  "plugins/cursor/skills",
  "plugins/claude-code/skills",
  "plugins/claude-desktop/skills",
  "plugins/codex/skills",
];

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function gitConfig(key) {
  return git(["config", "--file", ".gitmodules", "--get", key]);
}

function gitStage(path) {
  return git(["ls-files", "--stage", path]);
}

function remoteHead(url) {
  const out = git(["ls-remote", url, "HEAD"]);
  const [sha] = out.split(/\s+/);
  if (!sha) throw new Error(`Could not resolve remote HEAD for ${url}`);
  return sha;
}

function modulePaths() {
  try {
    return git(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"])
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/)[1]);
  } catch {
    return [];
  }
}

const errors = [];

const paths = modulePaths();
for (const path of paths) {
  if (path !== SOURCE_PATH) {
    errors.push(`Unexpected submodule path ${path}; plugin skills must be tracked files, not submodules`);
  }
}

try {
  const sourceUrl = gitConfig(`submodule.${SOURCE_PATH}.url`);
  if (sourceUrl !== CANONICAL_URL) {
    errors.push(`${SOURCE_PATH} must point at ${CANONICAL_URL}, got ${sourceUrl}`);
  }
} catch {
  errors.push(`.gitmodules must define submodule.${SOURCE_PATH}.url`);
}

try {
  const sourcePath = gitConfig(`submodule.${SOURCE_PATH}.path`);
  if (sourcePath !== SOURCE_PATH) {
    errors.push(`.gitmodules must define submodule.${SOURCE_PATH}.path = ${SOURCE_PATH}`);
  }
} catch {
  errors.push(`.gitmodules must define submodule.${SOURCE_PATH}.path`);
}

try {
  const [mode, pinned] = gitStage(SOURCE_PATH).split(/\s+/);
  if (mode !== "160000") {
    errors.push(`${SOURCE_PATH} must be a git submodule (mode ${mode || "missing"})`);
  } else {
    // The upstream-freshness comparison is a moving target: it fails whenever
    // Kong/volcano-skills advances past the pin. That is the right gate on
    // PRs/main (kept green by sync-skills.yml), but wrong on a release built
    // from an immutable tag — the tag froze a pin that upstream will outrun,
    // making releases non-deterministic and old tags impossible to rebuild.
    // SKILL_SUBMODULE_SKIP_UPSTREAM=1 (set only by release.yml) skips it; all
    // recorded-pin checks below still run.
    if (process.env.SKILL_SUBMODULE_SKIP_UPSTREAM !== "1") {
      const latest = remoteHead(CANONICAL_URL);
      if (pinned !== latest) {
        errors.push(`${SOURCE_PATH} is pinned to ${pinned}, but ${CANONICAL_URL} HEAD is ${latest}`);
      }
    }

    try {
      const worktreeHead = git(["-C", SOURCE_PATH, "rev-parse", "HEAD"]);
      if (worktreeHead !== pinned) {
        errors.push(`${SOURCE_PATH} worktree is ${worktreeHead}, but gitlink is ${pinned}`);
      }
    } catch {
      errors.push(`${SOURCE_PATH} worktree is not initialized; run git submodule update --init --recursive`);
    }
  }
} catch (err) {
  errors.push(err instanceof Error ? err.message : String(err));
}

for (const path of PLUGIN_SKILL_PATHS) {
  try {
    const line = gitStage(path);
    if (!line) {
      errors.push(`${path} is missing from the git index`);
    } else if (line.startsWith("160000 ")) {
      errors.push(`${path} must be materialized as tracked files, not a git submodule`);
    }
  } catch {
    errors.push(`${path} is missing from the git index`);
  }
}

if (errors.length > 0) {
  console.error("Skill source check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const [, pinned] = gitStage(SOURCE_PATH).split(/\s+/);
const freshness = process.env.SKILL_SUBMODULE_SKIP_UPSTREAM === "1" ? "upstream check skipped" : "latest";
console.log(`${SOURCE_PATH} -> ${pinned} (${freshness})`);
console.log("Plugin skills are materialized as tracked files for shallow-clone marketplaces.");
