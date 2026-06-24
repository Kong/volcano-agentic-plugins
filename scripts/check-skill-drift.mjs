import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "sources/volcano-skills");
const pluginSkillDirs = [
  "plugins/cursor/skills",
  "plugins/claude-code/skills",
  "plugins/claude-desktop/skills",
  "plugins/codex/skills",
];

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walkFiles(dir, base = dir) {
  if (!existsSync(dir)) throw new Error(`${rel(dir)} is missing`);

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

function readRelative(dir, relativePath) {
  return readFileSync(path.join(dir, relativePath));
}

function fileMode(dir, relativePath) {
  return statSync(path.join(dir, relativePath)).mode & 0o777;
}

const errors = [];
let sourceFiles = [];

try {
  sourceFiles = walkFiles(sourceDir);
  if (sourceFiles.length === 0) {
    errors.push("sources/volcano-skills contains no files; run git submodule update --init --recursive");
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

for (const pluginRel of pluginSkillDirs) {
  const pluginDir = path.join(root, pluginRel);
  let pluginFiles = [];

  try {
    pluginFiles = walkFiles(pluginDir);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const sourceSet = new Set(sourceFiles);
  const pluginSet = new Set(pluginFiles);

  for (const file of sourceFiles) {
    if (!pluginSet.has(file)) {
      errors.push(`${pluginRel} is missing ${file}`);
      continue;
    }

    const sourceContent = readRelative(sourceDir, file);
    const pluginContent = readRelative(pluginDir, file);
    if (!sourceContent.equals(pluginContent)) {
      errors.push(`${pluginRel}/${file} differs from sources/volcano-skills/${file}`);
    }

    const sourceMode = fileMode(sourceDir, file);
    const pluginMode = fileMode(pluginDir, file);
    if (sourceMode !== pluginMode) {
      errors.push(`${pluginRel}/${file} mode ${pluginMode.toString(8)} differs from source mode ${sourceMode.toString(8)}`);
    }
  }

  for (const file of pluginFiles) {
    if (!sourceSet.has(file)) {
      errors.push(`${pluginRel} has extra file ${file}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Materialized plugin skills drift from sources/volcano-skills:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Materialized plugin skills match sources/volcano-skills (${sourceFiles.length} files checked per plugin).`);
