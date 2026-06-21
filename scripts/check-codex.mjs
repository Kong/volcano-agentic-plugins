import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const manifest = readJson("plugins/codex/.codex-plugin/plugin.json");
for (const field of ["name", "version", "description", "skills"]) {
  if (!manifest[field]) throw new Error(`plugins/codex/.codex-plugin/plugin.json missing ${field}`);
}
if (manifest.name !== "volcano") throw new Error("Codex plugin name must be volcano");
if (manifest.skills !== "./skills/") throw new Error("Codex plugin skills must point to ./skills/");

const marketplace = readJson(".agents/plugins/marketplace.json");
const entry = marketplace.plugins?.find((plugin) => plugin?.source?.path === "./plugins/codex");
if (!entry) throw new Error(".agents/plugins/marketplace.json missing ./plugins/codex entry");
if (entry.interface?.displayName !== "Volcano") throw new Error("Codex marketplace displayName must be Volcano");

const gitlink = execFileSync("git", ["ls-files", "--stage", "plugins/codex/skills"], { encoding: "utf8" });
if (!gitlink.startsWith("160000 ")) throw new Error("plugins/codex/skills must be a git submodule");

const installSkill = readFileSync("plugins/codex/skills/install-volcano/SKILL.md", "utf8");
if (!installSkill.includes("name: install-volcano")) throw new Error("Codex skills submodule must expose install-volcano skill");
if (!installSkill.includes("volcano upgrade")) throw new Error("Codex install-volcano skill must upgrade an existing CLI");
if (installSkill.includes("bootstrap.sh") || installSkill.includes("--agent codex")) {
  throw new Error("Codex install-volcano skill must not run full bootstrap or wire agent configs");
}

console.log("Codex plugin manifest/marketplace smoke test passed.");
