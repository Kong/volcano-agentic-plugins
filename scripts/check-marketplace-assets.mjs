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
const claudeMarketplace = json(".claude-plugin/marketplace.json");
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

assert(vscode.icon === "./resources/volcano_128.png", "VS Code manifest must declare ./resources/volcano_128.png");
assertFile(path.join("plugins/vscode", vscode.icon));
const vscodeIcon = pngSize(path.join("plugins/vscode", vscode.icon));
assert(vscodeIcon.width === 128 && vscodeIcon.height === 128, "VS Code icon must be 128x128 PNG");
assert(vscode.license === "Apache-2.0", "VS Code manifest must declare Apache-2.0");

assert(claudeDesktop.icon === "./assets/volcano_256.png", "Claude Desktop manifest must declare ./assets/volcano_256.png");
assertFile(path.join("plugins/claude-desktop", claudeDesktop.icon));
const desktopIcon = pngSize(path.join("plugins/claude-desktop", claudeDesktop.icon));
assert(desktopIcon.width === 256 && desktopIcon.height === 256, "Claude Desktop icon must be 256x256 PNG");
for (const file of ["volcano_128.png", "volcano_dark_16.svg", "volcano_light_16.svg"]) {
  assertFile(`plugins/claude-desktop/assets/${file}`);
}
assert(claudeDesktop.license === "Apache-2.0", "Claude Desktop manifest must declare Apache-2.0");
assert(Array.isArray(claudeDesktop.keywords) && claudeDesktop.keywords.includes("volcano"), "Claude Desktop manifest must include keywords");

assert(claudeMarketplace.$schema === "https://anthropic.com/claude-code/marketplace.schema.json", "Claude marketplace must declare the Claude Code marketplace schema");
const claudeMarketplaceEntry = claudeMarketplace.plugins?.find((plugin) => plugin?.name === "volcano");
assert(claudeMarketplaceEntry, "Claude marketplace must include volcano plugin entry");
assert(claudeMarketplaceEntry.source === "./plugins/claude-code", "Claude marketplace must point at ./plugins/claude-code");
assert(claudeMarketplaceEntry.version === root.version, "Claude marketplace plugin version must match root version");
assert(claudeMarketplaceEntry.category === "development", "Claude marketplace plugin category must be development");
assertUrl(claudeMarketplaceEntry.homepage, "Claude marketplace homepage");

assert(claudeCode.icon === "./assets/volcano_256.png", "Claude Code manifest must declare ./assets/volcano_256.png");
assertFile(path.join("plugins/claude-code", claudeCode.icon));
const claudeCodeIcon = pngSize(path.join("plugins/claude-code", claudeCode.icon));
assert(claudeCodeIcon.width === 256 && claudeCodeIcon.height === 256, "Claude Code icon must be 256x256 PNG");
for (const file of ["volcano_128.png", "volcano_dark_16.svg", "volcano_light_16.svg"]) {
  assertFile(`plugins/claude-code/assets/${file}`);
}
assert(claudeCode.license === "Apache-2.0", "Claude Code manifest must declare Apache-2.0");
assertUrl(claudeCode.homepage, "Claude Code homepage");
assertUrl(claudeCode.repository, "Claude Code repository");

assert(cursor.rules === "./rules/", "Cursor manifest must expose rules");
assert(cursor.skills === "./skills/", "Cursor manifest must expose materialized skills");
assert(cursor.commands === "./commands/", "Cursor manifest must expose commands");
assert(cursorMarketplace.plugins?.some((plugin) => plugin?.name === "volcano" && plugin?.source === "./plugins/cursor"), "Cursor marketplace must point at ./plugins/cursor");
assertFile("plugins/cursor/assets/volcano_256.png");
assertFile("plugins/cursor/assets/volcano_128.png");
assertFile("plugins/cursor/assets/volcano_dark_16.svg");
assertFile("plugins/cursor/assets/volcano_light_16.svg");
const cursorIcon256 = pngSize("plugins/cursor/assets/volcano_256.png");
const cursorIcon128 = pngSize("plugins/cursor/assets/volcano_128.png");
assert(cursorIcon256.width === 256 && cursorIcon256.height === 256, "Cursor 256px icon must be 256x256 PNG");
assert(cursorIcon128.width === 128 && cursorIcon128.height === 128, "Cursor 128px icon must be 128x128 PNG");

assert(codex.license === "Apache-2.0", "Codex manifest must declare Apache-2.0");
assertUrl(codex.homepage, "Codex homepage");
assertUrl(codex.repository, "Codex repository");
assert(codex.interface?.logo === "./assets/volcano_256.png", "Codex manifest must declare ./assets/volcano_256.png");
assertFile(path.join("plugins/codex", codex.interface.logo));
const codexIcon = pngSize(path.join("plugins/codex", codex.interface.logo));
assert(codexIcon.width === 256 && codexIcon.height === 256, "Codex logo must be 256x256 PNG");
for (const file of ["volcano_128.png", "volcano_dark_16.svg", "volcano_light_16.svg"]) {
  assertFile(`plugins/codex/assets/${file}`);
}
assert(codex.interface?.brandColor === "#F37A58", "Codex manifest must declare the Volcano brand color (#F37A58)");
assert(codexMarketplace.plugins?.some((plugin) => plugin?.name === "volcano" && plugin?.source?.path === "./plugins/codex"), "Codex marketplace must point at ./plugins/codex");

for (const plugin of ["cursor", "claude-code", "claude-desktop", "codex", "vscode"]) {
  assertFile(`plugins/${plugin}/LICENSE`);
}

console.log(`Marketplace asset/manifest check passed for version ${root.version}.`);
