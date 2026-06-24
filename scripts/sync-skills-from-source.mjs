import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

if (!existsSync(path.join(sourceDir, "index.json"))) {
  throw new Error("sources/volcano-skills is not initialized; run git submodule update --init --recursive");
}

for (const pluginRel of pluginSkillDirs) {
  const pluginDir = path.join(root, pluginRel);
  rmSync(pluginDir, { recursive: true, force: true });
  mkdirSync(path.dirname(pluginDir), { recursive: true });
  cpSync(sourceDir, pluginDir, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".git" && path.basename(src) !== ".DS_Store",
  });
  console.log(`Synced ${pluginRel} from sources/volcano-skills`);
}
