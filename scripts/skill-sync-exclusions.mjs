// Shared by sync-skills-from-source.mjs and check-skill-drift.mjs so the copy
// and the drift check always agree on what is left out of plugin skills.

// Never skill content, wherever they appear.
export const EXCLUDED_BASENAMES = new Set([".git", ".DS_Store", ".github"]);

// Tooling for the volcano-skills repo itself (catalog validator and its
// tests). Excluded only at the root of the skills tree, so a skill's own
// scripts/ or tests/ folder is still copied. The Claude Code plugin directory
// refuses scripts from unverified publishers, and no harness needs these.
export const EXCLUDED_ROOT_ENTRIES = new Set(["scripts", "tests"]);

// relativePath uses "/" separators and is relative to the skills root.
export function isExcluded(relativePath) {
  const parts = relativePath.split("/");
  if (parts.some((part) => EXCLUDED_BASENAMES.has(part))) return true;
  return EXCLUDED_ROOT_ENTRIES.has(parts[0]);
}
