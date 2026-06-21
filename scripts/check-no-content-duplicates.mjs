import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(root, "plugins");
const sourceDir = path.join(root, "sources", "volcano-skills");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const canonicalFiles = [];
for (const file of ["AGENTS.md", "CLAUDE.md", "index.json"]) {
  const full = path.join(sourceDir, file);
  if (existsSync(full)) canonicalFiles.push(full);
}
if (existsSync(sourceDir)) {
  for (const file of await walk(sourceDir)) {
    if (path.basename(file) === "SKILL.md") canonicalFiles.push(file);
  }
}

const canonicalHashes = new Map();
for (const file of canonicalFiles) {
  canonicalHashes.set(await sha256(file), path.relative(root, file));
}

const pluginFiles = await walk(pluginsDir);
const violations = [];
for (const file of pluginFiles) {
  const base = path.basename(file);
  // Never allow these canonical top-level files to be copied into plugins.
  if (["AGENTS.md", "CLAUDE.md", "index.json"].includes(base)) {
    violations.push({ file, reason: `copies canonical ${base}` });
    continue;
  }

  // SKILL.md is valid for plugin-local pointer skills, but must not byte-for-byte
  // duplicate a canonical Volcano skill from sources/volcano-skills.
  if (base === "SKILL.md") {
    const hash = await sha256(file);
    const canonical = canonicalHashes.get(hash);
    if (canonical) {
      violations.push({ file, reason: `duplicates ${canonical}` });
    }
  }
}

if (violations.length > 0) {
  console.error("Plugin content duplication detected. Canonical content must live only in sources/volcano-skills.");
  for (const v of violations) {
    console.error(`- ${path.relative(root, v.file)} (${v.reason})`);
  }
  process.exit(1);
}

console.log("No duplicated canonical content under plugins/.");
