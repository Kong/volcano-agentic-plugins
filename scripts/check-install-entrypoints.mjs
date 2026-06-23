import { readFileSync, existsSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCliOnlyInstaller(content, label) {
  assert(content.includes("name: install-volcano"), `${label} must be named install-volcano`);
  assert(content.includes("volcano upgrade"), `${label} must upgrade an existing CLI with volcano upgrade`);
  assert(content.includes("releases/latest/download"), `${label} must download latest CLI when missing`);
  assert(!content.includes("bootstrap.sh"), `${label} must not use bootstrap.sh`);
  assert(!content.includes("--agent"), `${label} must not wire agent configs or download runtime skills`);
}

const cursorInstall = read("plugins/cursor/commands/install-volcano.md");
assertCliOnlyInstaller(cursorInstall, "Cursor install-volcano command");

const claudeInstall = read("plugins/claude-code/commands/install-volcano.md");
assertCliOnlyInstaller(claudeInstall, "Claude Code install-volcano command");

for (const plugin of ["cursor", "claude-code", "claude-desktop", "codex"]) {
  const skillPath = `plugins/${plugin}/skills/install-volcano/SKILL.md`;
  assert(existsSync(skillPath), `${plugin} skills submodule must expose install-volcano/SKILL.md`);
}

const codexInstall = read("plugins/codex/skills/install-volcano/SKILL.md");
assertCliOnlyInstaller(codexInstall, "Codex install-volcano skill");

const desktopManifest = json("plugins/claude-desktop/manifest.json");
assert(desktopManifest.tools?.some((tool) => tool.name === "install-volcano"), "Claude Desktop manifest must expose install-volcano tool");

const vscodeManifest = json("plugins/vscode/package.json");
assert(
  vscodeManifest.contributes?.commands?.some((command) => command.command === "volcano.install-volcano"),
  "VS Code extension must expose volcano.install-volcano command",
);

console.log("Install-volcano entrypoint check passed.");
