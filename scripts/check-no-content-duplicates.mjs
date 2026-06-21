import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = path.join(root, "plugins");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function skillSubmodulePaths() {
  const out = git(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((p) => p?.startsWith("plugins/") && p.endsWith("/skills"));
}

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

const canonicalSubmodules = skillSubmodulePaths().map((p) => `${p}/`);
const pluginFiles = await walk(pluginsDir);
const violations = [];

for (const file of pluginFiles) {
  const rel = path.relative(root, file);
  const base = path.basename(file);

  // Canonical content is allowed only when it comes through a plugin-local
  // skills git submodule (plugins/<ide>/skills).
  if (canonicalSubmodules.some((submodulePath) => rel.startsWith(submodulePath))) {
    continue;
  }

  if (["AGENTS.md", "CLAUDE.md", "index.json", "SKILL.md"].includes(base)) {
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error("Plugin content duplication detected. Canonical content must live only in plugin-local skills submodules.");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("No duplicated canonical content under plugins/ outside skills submodules.");
