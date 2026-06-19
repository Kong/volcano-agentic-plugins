import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsSource = path.join(root, "sources", "volcano-skills");
const cursorPlugin = path.join(root, "plugins", "cursor");

async function assertExists(p, label) {
  if (!existsSync(p)) {
    throw new Error(`${label} not found: ${p}`);
  }
}

await assertExists(skillsSource, "volcano-skills submodule");
await assertExists(path.join(skillsSource, "index.json"), "skills index");

const generatedSkillsDir = path.join(cursorPlugin, "skills");
const generatedRulesDir = path.join(cursorPlugin, "rules");
const generatedAssetsDir = path.join(cursorPlugin, "assets");

await rm(generatedSkillsDir, { recursive: true, force: true });
await mkdir(generatedSkillsDir, { recursive: true });
await mkdir(generatedRulesDir, { recursive: true });
await mkdir(generatedAssetsDir, { recursive: true });

const entries = await readdir(skillsSource, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const skillMd = path.join(skillsSource, entry.name, "SKILL.md");
  if (!existsSync(skillMd)) continue;
  await cp(path.join(skillsSource, entry.name), path.join(generatedSkillsDir, entry.name), {
    recursive: true,
  });
}

for (const file of ["index.json", "AGENTS.md", "CLAUDE.md"]) {
  const src = path.join(skillsSource, file);
  if (existsSync(src)) await cp(src, path.join(generatedAssetsDir, file));
}

const agentsMdPath = path.join(skillsSource, "AGENTS.md");
const agentsMd = existsSync(agentsMdPath)
  ? await readFile(agentsMdPath, "utf8")
  : `Volcano is a serverless JavaScript platform. Use the Volcano CLI first.`;

const rule = `---
description: Volcano platform rules, CLI-first workflows, and safety model
alwaysApply: true
---

# Volcano

The Cursor plugin installs Volcano's canonical skills under this plugin's skills directory. Use them when the user is building, deploying, or maintaining a Volcano app.

${agentsMd.trim()}
`;

await writeFile(path.join(generatedRulesDir, "volcano.mdc"), rule);

console.log(`Synced Cursor plugin from ${path.relative(root, skillsSource)} -> ${path.relative(root, cursorPlugin)}`);
