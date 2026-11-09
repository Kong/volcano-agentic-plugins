// Decides which parts of sources/volcano-skills reach the plugin skill copies.
// Shared by sync-skills-from-source.mjs, check-skill-drift.mjs, and
// package-codex.mjs so they always agree.
//
// Only the catalog is copied: the root files below plus each skill folder that
// index.json registers. Anything else the skills repo keeps at its root (its
// validator, tests, CI config, future tooling) stays out. The Claude Code
// plugin directory refuses scripts from unverified publishers, and no harness
// needs that tooling.
import { readFileSync } from "node:fs";
import path from "node:path";

// Never meaningful content on either side of a sync.
export const NEVER_CONTENT_BASENAMES = new Set([".git", ".DS_Store"]);
// Dropped wherever they appear inside copied content or a package.
export const EXCLUDED_BASENAMES = new Set([...NEVER_CONTENT_BASENAMES, ".github"]);

const ROOT_FILES = ["AGENTS.md", "index.json"];
const SKILL_PATH = /^\/skills\/([A-Za-z0-9][A-Za-z0-9._-]*)\/SKILL\.md$/;

// Root-level entries of sources/volcano-skills that are copied to plugins.
export function catalogRootEntries(sourceDir) {
  const index = JSON.parse(readFileSync(path.join(sourceDir, "index.json"), "utf8"));
  if (!Array.isArray(index.skills)) throw new Error("sources/volcano-skills/index.json must have a skills array");
  const skillDirs = index.skills.map((skill, i) => {
    const match = SKILL_PATH.exec(skill?.path ?? "");
    if (!match) throw new Error(`index.json skills[${i}].path must look like /skills/<name>/SKILL.md, got ${skill?.path}`);
    return match[1];
  });
  return new Set([...ROOT_FILES, ...skillDirs]);
}

// relativePath uses "/" separators and is relative to the skills root.
export function isOutsideCatalog(relativePath, rootEntries) {
  const parts = relativePath.split("/");
  if (!rootEntries.has(parts[0])) return true;
  return parts.some((part) => EXCLUDED_BASENAMES.has(part));
}
