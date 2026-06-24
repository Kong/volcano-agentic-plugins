import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFile(file) {
  assert(existsSync(file), `${file} must exist`);
}

function pngSize(file) {
  const buf = readFileSync(file);
  assert(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${file} must be a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function assertUrl(value, label) {
  assert(typeof value === "string" && /^https:\/\//.test(value), `${label} must be an https URL`);
}

const root = json("package.json");
const vscode = json("plugins/vscode/package.json");
const cursor = json("plugins/cursor/.cursor-plugin/plugin.json");
const cursorMarketplace = json(".cursor-plugin/marketplace.json");
const claudeCode = json("plugins/claude-code/.claude-plugin/plugin.json");
const claudeDesktop = json("plugins/claude-desktop/manifest.json");
const codex = json("plugins/codex/.codex-plugin/plugin.json");
const codexMarketplace = json(".agents/plugins/marketplace.json");

const versions = new Map([
  ["root", root.version],
  ["vscode", vscode.version],
  ["cursor", cursor.version],
  ["claude-code", claudeCode.version],
  ["claude-desktop", claudeDesktop.version],
  ["codex", codex.version],
]);
assert(new Set(versions.values()).size === 1, `publishable versions must match: ${JSON.stringify(Object.fromEntries(versions))}`);

assert(vscode.icon === "resources/icon.png", "VS Code manifest must declare resources/icon.png");
assertFile(path.join("plugins/vscode", vscode.icon));
const vscodeIcon = pngSize(path.join("plugins/vscode", vscode.icon));
assert(vscodeIcon.width === 128 && vscodeIcon.height === 128, "VS Code icon must be 128x128 PNG");
assert(vscode.license === "Apache-2.0", "VS Code manifest must declare Apache-2.0");

assert(claudeDesktop.icon === "icon.png", "Claude Desktop manifest must declare icon.png");
assertFile(path.join("plugins/claude-desktop", claudeDesktop.icon));
const desktopIcon = pngSize(path.join("plugins/claude-desktop", claudeDesktop.icon));
assert(desktopIcon.width === 512 && desktopIcon.height === 512, "Claude Desktop icon must be 512x512 PNG");
assert(claudeDesktop.license === "Apache-2.0", "Claude Desktop manifest must declare Apache-2.0");
assert(Array.isArray(claudeDesktop.keywords) && claudeDesktop.keywords.includes("volcano"), "Claude Desktop manifest must include keywords");

assert(claudeCode.license === "Apache-2.0", "Claude Code manifest must declare Apache-2.0");
assertUrl(claudeCode.homepage, "Claude Code homepage");
assertUrl(claudeCode.repository, "Claude Code repository");

assert(cursor.rules === "./rules/", "Cursor manifest must expose rules");
assert(cursor.skills === "./skills/", "Cursor manifest must expose materialized skills");
assert(cursor.commands === "./commands/", "Cursor manifest must expose commands");
assert(cursorMarketplace.plugins?.some((plugin) => plugin?.name === "volcano" && plugin?.source === "plugins/cursor"), "Cursor marketplace must point at plugins/cursor");
assertFile("plugins/cursor/assets/volcano-icon.png");
assertFile("plugins/cursor/assets/volcano-logo.svg");

assert(codex.license === "Apache-2.0", "Codex manifest must declare Apache-2.0");
assertUrl(codex.homepage, "Codex homepage");
assertUrl(codex.repository, "Codex repository");
assert(codex.interface?.logo === "./assets/volcano-logo.svg", "Codex manifest must declare interface.logo");
assert(codex.interface?.brandColor === "#D71920", "Codex manifest must declare brandColor");
assertFile(path.join("plugins/codex", codex.interface.logo));
assertFile("plugins/codex/assets/volcano-icon.png");
assert(codexMarketplace.plugins?.some((plugin) => plugin?.name === "volcano" && plugin?.source?.path === "./plugins/codex"), "Codex marketplace must point at ./plugins/codex");

for (const plugin of ["cursor", "claude-code", "claude-desktop", "codex", "vscode"]) {
  assertFile(`plugins/${plugin}/LICENSE`);
}

console.log(`Marketplace asset/manifest check passed for version ${root.version}.`);
