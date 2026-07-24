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
}

// Decode the embedded installer shell script out of each entrypoint kind so the
// plugin-first assertions run against the *actual script* the user executes
// (not the surrounding Markdown/JS). The two command wrappers carry a fenced
// ```sh block; the VS Code / Claude Desktop twins carry the same script as a
// JSON string literal that starts with the `set -eu` preamble.
function decodeInstallerScript(path, label) {
  const raw = read(path);
  if (path.endsWith(".md")) {
    const m = raw.match(/```sh\n(set -eu[\s\S]*?)\n```/);
    assert(m, `${label} must carry a fenced sh installer block`);
    return m[1];
  }
  const m = raw.match(/"set -eu(?:[^"\\]|\\.)*"/);
  assert(m, `${label} must embed the installer script as a string literal`);
  return JSON.parse(m[0]);
}

// Slice a shell function body out of the decoded script: from `name() {` to the
// first column-0 `}` (these functions have no column-0 nested braces).
function shellFunctionBody(script, name) {
  const start = script.indexOf(`${name}() {`);
  if (start === -1) return "";
  const rest = script.slice(start);
  const end = rest.indexOf("\n}\n");
  return end === -1 ? rest : rest.slice(0, end);
}

// Every command-wrapper copy (all four, not just the two Markdown ones) must
// carry the plugin-first guard from scripts/bootstrap.sh: when the Volcano
// plugin is installed it is the source of truth, so the installer must NOT wire
// a second, independently-stale ~/.volcano/AGENTS.md @-import into CLAUDE.md.
// Assert call *structure* (the guard is invoked inside wire_existing_claude_config,
// before any upsert), not merely that the helper identifiers appear somewhere —
// deleting the invocation while keeping the definitions must fail this check.
function assertPluginFirstWiring(script, label) {
  for (const fn of ["strip_managed_block", "remove_block", "claude_has_volcano_plugin", "wire_existing_claude_config"]) {
    assert(script.includes(`${fn}() {`), `${label} must define ${fn}()`);
  }
  const wiring = shellFunctionBody(script, "wire_existing_claude_config");
  assert(/if\s+claude_has_volcano_plugin;\s*then/.test(wiring), `${label} wire_existing_claude_config must gate on claude_has_volcano_plugin`);
  assert(/remove_block\s+"\$HOME\/\.claude\/CLAUDE\.md"/.test(wiring), `${label} must strip the stale CLAUDE.md block when the plugin is present`);
  const guardIdx = wiring.indexOf("claude_has_volcano_plugin");
  const upsertIdx = wiring.indexOf("upsert_block");
  assert(guardIdx !== -1 && (upsertIdx === -1 || guardIdx < upsertIdx), `${label} must check the plugin before upserting a managed block`);
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

// Plugin-first wiring must hold for all four hand-maintained copies of the
// installer script (the two Markdown commands plus the VS Code and Claude
// Desktop embedded twins), so none can silently drift back to always-wiring.
const pluginFirstCopies = [
  ["plugins/cursor/commands/install-volcano.md", "Cursor install-volcano command"],
  ["plugins/claude-code/commands/install-volcano.md", "Claude Code install-volcano command"],
  ["plugins/vscode/src/extension.ts", "VS Code embedded install-volcano script"],
  ["plugins/claude-desktop/server/index.js", "Claude Desktop embedded install-volcano script"],
];
let canonicalScript;
for (const [path, label] of pluginFirstCopies) {
  const script = decodeInstallerScript(path, label);
  assertPluginFirstWiring(script, label);
  // All four copies must stay byte-identical, so a fix to one can't miss another.
  if (canonicalScript === undefined) canonicalScript = script;
  else assert(script === canonicalScript, `${label} installer script has drifted from the other copies`);
}

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
