import { execFileSync } from "node:child_process";
import process from "node:process";

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function moduleEntries() {
  const pathsOut = git(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
  const entries = [];

  for (const line of pathsOut.split("\n")) {
    const [key, path] = line.trim().split(/\s+/);
    if (!path?.startsWith("plugins/") || !path.endsWith("/skills")) continue;
    const name = key.replace(/^submodule\./, "").replace(/\.path$/, "");
    const url = git(["config", "--file", ".gitmodules", "--get", `submodule.${name}.url`]);
    entries.push({ name, path, url });
  }

  return entries;
}

function indexSha(path) {
  const line = git(["ls-files", "--stage", path]);
  const [mode, sha] = line.split(/\s+/);
  if (mode !== "160000") {
    throw new Error(`${path} is not a git submodule (mode ${mode || "missing"})`);
  }
  return sha;
}

function remoteHead(url) {
  const out = git(["ls-remote", url, "HEAD"]);
  const [sha] = out.split(/\s+/);
  if (!sha) throw new Error(`Could not resolve remote HEAD for ${url}`);
  return sha;
}

const entries = moduleEntries();
if (entries.length === 0) {
  console.error("No plugin-local skills submodules found in .gitmodules.");
  process.exit(1);
}

const errors = [];
const remoteHeads = new Map();

for (const entry of entries) {
  try {
    const pinned = indexSha(entry.path);
    const latest = remoteHead(entry.url);
    remoteHeads.set(entry.url, latest);

    if (pinned !== latest) {
      errors.push(`${entry.path} is pinned to ${pinned}, but ${entry.url} HEAD is ${latest}`);
    }

    // If checked out locally, ensure worktree matches the committed gitlink.
    try {
      const worktreeHead = git(["-C", entry.path, "rev-parse", "HEAD"]);
      if (worktreeHead !== pinned) {
        errors.push(`${entry.path} worktree is ${worktreeHead}, but gitlink is ${pinned}`);
      }
    } catch {
      // CI checkout with submodules=false can still check gitlinks; ignore.
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
}

const pinnedSet = new Set(entries.map((entry) => indexSha(entry.path)));
if (pinnedSet.size > 1) {
  errors.push(`Skill submodules are not all pinned to the same commit: ${[...pinnedSet].join(", ")}`);
}

if (errors.length > 0) {
  console.error("Skill submodule check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

for (const entry of entries) {
  console.log(`${entry.path} -> ${indexSha(entry.path)} (latest)`);
}
