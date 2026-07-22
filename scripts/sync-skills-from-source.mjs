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
const EXCLUDED_BASENAMES = new Set([".git", ".DS_Store", ".github"]);

if (!existsSync(path.join(sourceDir, "index.json"))) {
  throw new Error("sources/volcano-skills is not initialized; run git submodule update --init --recursive");
}

for (const pluginRel of pluginSkillDirs) {
  const pluginDir = path.join(root, pluginRel);
  rmSync(pluginDir, { recursive: true, force: true });
  mkdirSync(path.dirname(pluginDir), { recursive: true });
  cpSync(sourceDir, pluginDir, {
    recursive: true,
    // .github is CI automation that lives in volcano-skills for its own repo,
    // not skill content meant for distribution — exclude it alongside the
    // other non-content entries. Keep in sync with check-skill-drift.mjs's
    // identical exclusion list.
    filter: (src) => !EXCLUDED_BASENAMES.has(path.basename(src)),
  });
  console.log(`Synced ${pluginRel} from sources/volcano-skills`);
}
