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

// Two install-volcano entrypoint kinds now have deliberately different contracts:
//
//  - Imperative host installers (the Cursor / Claude Code `/install-volcano`
//    slash-command wrappers) run a concrete script a human explicitly triggers.
//    They keep a concrete npm-default-with-GitHub-release-fallback install.
//  - The materialized skills (synced from volcano-skills) are model-facing
//    guidance. They are package-manager-agnostic: they read the CLI's own
//    installation.md and pick whichever manager is on PATH, with no hardcoded
//    install command and none of the old bespoke content/wiring script.
//
// Asserting one identical contract across both (the previous behavior) is wrong
// now that they diverge by design, so each kind is validated against its own.

function assertCliOnlyInstaller(content, label) {
  assert(content.includes("name: install-volcano"), `${label} must be named install-volcano`);
  assert(content.includes("volcano upgrade"), `${label} must upgrade an existing CLI with volcano upgrade`);
  assert(content.includes("@volcano.dev/cli@latest"), `${label} must install the Volcano CLI from npm by default`);
  assert(content.includes("npm install -g"), `${label} must use npm install -g for the default CLI install`);
  assert(content.includes("releases/latest/download"), `${label} must keep GitHub release download as fallback`);
  assert(!content.includes("bootstrap.sh"), `${label} must not use bootstrap.sh`);
  assert(!content.includes("--agent"), `${label} must not run full bootstrap agent wiring or download runtime skills`);
  // Plugin-first wiring (mirrors scripts/bootstrap.sh): when the Volcano plugin
  // is installed it is the source of truth, so the installer must NOT wire a
  // second, independently-stale ~/.volcano/AGENTS.md @-import into CLAUDE.md — it
  // must detect the plugin and strip any block a prior no-plugin run left behind.
  assert(content.includes("claude_has_volcano_plugin"), `${label} must detect an installed Claude Code plugin before wiring`);
  assert(content.includes("remove_block"), `${label} must strip a stale managed block when the plugin is present`);
}

function assertAgnosticSkill(content, label) {
  assert(content.includes("name: install-volcano"), `${label} must be named install-volcano`);
  assert(content.includes("volcano upgrade"), `${label} must upgrade an existing CLI with volcano upgrade`);
  // Package-manager-agnostic: reads the CLI's own installation doc and probes
  // multiple managers rather than hardcoding one.
  assert(content.includes("installation.md"), `${label} must read the CLI's own installation.md`);
  assert(content.includes("pnpm") && content.includes("brew"), `${label} must probe multiple package managers (not npm-only)`);
  // The old bespoke installer must be gone: no hardcoded npm package spec, no
  // GitHub-release download step, no content-install / CLAUDE.md-wiring script.
  assert(!content.includes("@volcano.dev/cli@latest"), `${label} must not hardcode an npm package as the default install`);
  assert(!content.includes("releases/latest/download"), `${label} must not carry the old GitHub-release download step`);
  assert(!content.includes("install_volcano_content"), `${label} must not carry the old content-install script`);
  assert(!content.includes("wire_existing_claude_config"), `${label} must not wire ~/.claude/CLAUDE.md`);
  assert(!content.includes("bootstrap.sh"), `${label} must not use bootstrap.sh`);
  assert(!content.includes("--agent"), `${label} must not run full bootstrap agent wiring or download runtime skills`);
}

const cursorInstall = read("plugins/cursor/commands/install-volcano.md");
assertCliOnlyInstaller(cursorInstall, "Cursor install-volcano command");

const claudeInstall = read("plugins/claude-code/commands/install-volcano.md");
assertCliOnlyInstaller(claudeInstall, "Claude Code install-volcano command");

for (const plugin of ["cursor", "claude-code", "claude-desktop", "codex"]) {
  const skillPath = `plugins/${plugin}/skills/install-volcano/SKILL.md`;
  assert(existsSync(skillPath), `${plugin} materialized skills must expose install-volcano/SKILL.md`);
  assertAgnosticSkill(read(skillPath), `${plugin} install-volcano skill`);
}

const desktopManifest = json("plugins/claude-desktop/manifest.json");
assert(desktopManifest.tools?.some((tool) => tool.name === "install-volcano"), "Claude Desktop manifest must expose install-volcano tool");

const vscodeManifest = json("plugins/vscode/package.json");
assert(
  vscodeManifest.contributes?.commands?.some((command) => command.command === "volcano.install-volcano"),
  "VS Code extension must expose volcano.install-volcano command",
);

console.log("Install-volcano entrypoint check passed.");
