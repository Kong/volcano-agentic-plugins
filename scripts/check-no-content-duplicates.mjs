import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(root, "plugins");
const allowedCanonicalPrefixes = [
  "plugins/cursor/skills/",
  "plugins/claude-code/skills/",
  "plugins/claude-desktop/skills/",
  "plugins/codex/skills/",
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const pluginFiles = await walk(pluginsDir);
const violations = [];

for (const file of pluginFiles) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const base = path.basename(file);

  // Marketplace plugin hosts shallow-clone the repository without submodules, so
  // plugin skills are intentionally materialized as tracked files under exactly
  // these skills directories. scripts/check-skill-drift.mjs keeps those copies
  // byte-for-byte aligned with sources/volcano-skills.
  if (allowedCanonicalPrefixes.some((prefix) => rel.startsWith(prefix))) {
    continue;
  }

  if (["AGENTS.md", "CLAUDE.md", "index.json", "SKILL.md"].includes(base)) {
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error("Unexpected canonical content detected outside approved materialized skills directories.");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("Canonical content appears only in approved materialized plugin skills directories.");
