import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isExcluded } from "./skill-sync-exclusions.mjs";

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
    // The exclusion list lives in skill-sync-exclusions.mjs, shared with
    // check-skill-drift.mjs.
    filter: (src) => {
      const relative = path.relative(sourceDir, src).split(path.sep).join("/");
      return relative === "" || !isExcluded(relative);
    },
  });
  console.log(`Synced ${pluginRel} from sources/volcano-skills`);
}
