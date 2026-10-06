import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function read(path) {
  return readFileSync(path, "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Explicit host installer commands keep their existing imperative behavior.
// Model-facing skills use verified, exact-version npm installs and reuse an
// existing working CLI. Validate each entrypoint against its own contract.

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

// The installers usually run from inside the user's open project. A repository
// must not be able to supply the AGENTS.md and skills that land in the user's
// global agent config, so run each script's own discovery in a sandbox HOME from
// a workspace that carries a Volcano-shaped skills directory at $PWD, $PWD/skills
// and ../skills, with more repository copies under host directories that are
// not plugin installs, and require that only an installed plugin or the explicit
// VOLCANO_PLUGIN_SKILLS_DIR override is ever chosen.
function plantSkillsDir(dir) {
  mkdirSync(path.join(dir, "volcano-platform"), { recursive: true });
  writeFileSync(path.join(dir, "AGENTS.md"), "# Volcano (planted)\n");
  writeFileSync(path.join(dir, "index.json"), "{}\n");
  writeFileSync(path.join(dir, "volcano-platform", "SKILL.md"), "# Volcano (planted)\n");
}

function assertIgnoresWorkspaceSkills(script, label) {
  const discovery = ["valid_agents_md", "is_plugin_skills_dir", "find_plugin_skills_dir"]
    .map((fn) => {
      const body = shellFunctionBody(script, fn);
      assert(body, `${label} must define ${fn}()`);
      return `${body}\n}`;
    })
    .join("\n");

  const sandbox = mkdtempSync(path.join(tmpdir(), "volcano-installer-skills-"));
  try {
    const home = path.join(sandbox, "home");
    const workspace = path.join(sandbox, "projects", "repo");
    mkdirSync(home, { recursive: true });
    plantSkillsDir(workspace);
    plantSkillsDir(path.join(workspace, "skills"));
    plantSkillsDir(path.join(sandbox, "projects", "skills"));
    // Repository checkouts can also sit under a host's own directory, e.g. Cursor's agent worktrees.
    plantSkillsDir(path.join(home, ".cursor", "worktrees", "repo", "abc", "skills"));
    plantSkillsDir(path.join(home, ".claude", "projects", "repo", "skills"));
    plantSkillsDir(path.join(home, ".config", "repo", "skills"));

    const find = (env = {}) => {
      const result = spawnSync("/bin/sh", ["-c", `${discovery}\nfind_plugin_skills_dir`], {
        cwd: workspace,
        env: { PATH: process.env.PATH, HOME: home, ...env },
        encoding: "utf8",
      });
      return result.status === 0 ? result.stdout.trim() : undefined;
    };

    assert(find() === undefined, `${label} must not install plugin skills from the workspace`);

    for (const installed of [
      path.join(home, ".claude", "plugins", "cache", "volcano-agentic-plugins", "volcano", "0.0.0", "skills"),
      path.join(home, ".cursor", "plugins", "local", "volcano", "skills"),
    ]) {
      plantSkillsDir(installed);
      assert(find() === installed, `${label} must use the installed plugin's skills at ${path.relative(home, installed)}, not the workspace's`);
      rmSync(installed, { recursive: true });
    }

    const checkout = path.join(sandbox, "checkout", "skills");
    plantSkillsDir(checkout);
    assert(find({ VOLCANO_PLUGIN_SKILLS_DIR: checkout }) === checkout, `${label} must honor VOLCANO_PLUGIN_SKILLS_DIR`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function assertVerifiedSkill(content, label) {
  assert(content.includes("name: install-volcano"), `${label} must be named install-volcano`);
  assert(content.includes("Do not auto-upgrade"), `${label} must reuse the installed CLI`);
  assert(content.includes("npm view @volcano.dev/cli@EXACT_VERSION"), `${label} must inspect exact-version package metadata`);
  assert(content.includes("dist.integrity") && content.includes("dist.tarball"), `${label} must verify package provenance and integrity`);
  assert(content.includes("npm install --global @volcano.dev/cli@EXACT_VERSION --registry=https://registry.npmjs.org"), `${label} must install the verified version from the official registry`);
  for (const forbidden of ["@volcano.dev/cli@latest", "releases/latest/download", "installation.md", "bootstrap.sh", "wire_existing_claude_config"]) {
    assert(!content.includes(forbidden), `${label} must not use ${forbidden}`);
  }
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
assertIgnoresWorkspaceSkills(canonicalScript, "install-volcano installer script");
assertIgnoresWorkspaceSkills(read("scripts/bootstrap.sh"), "scripts/bootstrap.sh");

for (const plugin of ["cursor", "claude-code", "claude-desktop", "codex"]) {
  const skillPath = `plugins/${plugin}/skills/install-volcano/SKILL.md`;
  assert(existsSync(skillPath), `${plugin} materialized skills must expose install-volcano/SKILL.md`);
  assertVerifiedSkill(read(skillPath), `${plugin} install-volcano skill`);
}

const desktopManifest = json("plugins/claude-desktop/manifest.json");
assert(desktopManifest.tools?.some((tool) => tool.name === "install-volcano"), "Claude Desktop manifest must expose install-volcano tool");

const vscodeManifest = json("plugins/vscode/package.json");
assert(
  vscodeManifest.contributes?.commands?.some((command) => command.command === "volcano.install-volcano"),
  "VS Code extension must expose volcano.install-volcano command",
);

console.log("Install-volcano entrypoint check passed.");
