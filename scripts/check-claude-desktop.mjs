import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const manifest = JSON.parse(readFileSync("plugins/claude-desktop/manifest.json", "utf8"));
for (const field of ["manifest_version", "name", "version", "description", "author", "server"]) {
  if (!manifest[field]) throw new Error(`plugins/claude-desktop/manifest.json missing ${field}`);
}
if (manifest.server.type !== "node") throw new Error("Claude Desktop server.type must be node");
if (manifest.server.entry_point !== "server/index.js") throw new Error("Unexpected Claude Desktop server entry_point");

const input = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "volcano_setup_instructions", arguments: {} } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "install-volcano", arguments: {} } },
]
  .map((message) => JSON.stringify(message))
  .join("\n") + "\n";

function runServer(server) {
  const result = spawnSync(process.execPath, [server], { input, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Claude Desktop server exited ${result.status}: ${result.stderr}`);
  }
  const responses = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(responses.length, 4, "Claude Desktop must answer every request");
  return responses;
}

function assertSetup(responses, expected) {
  for (const response of responses.slice(2)) {
    assert.equal(response.result?.content?.[0]?.text, expected, "Both setup tools must return the packaged setup skill");
    assert.notEqual(response.result?.isError, true, "Packaged setup must succeed");
  }
}

const responses = runServer("plugins/claude-desktop/server/index.js");
if (!responses[0].result?.capabilities?.tools) throw new Error("initialize response missing tools capability");
const tools = responses[1].result?.tools?.map((tool) => tool.name) ?? [];
for (const tool of ["install-volcano", "volcano_setup_instructions", "volcano_agent_instructions", "volcano_skill_index"]) {
  if (!tools.includes(tool)) throw new Error(`tools/list missing ${tool}`);
}
const setupSkill = readFileSync("plugins/claude-desktop/skills/install-volcano/SKILL.md", "utf8");
assertSetup(responses, setupSkill);

// A package without source submodules must use its own synced skill, not a
// hardcoded copy or network fallback. Only the server and setup skill are needed.
const sandbox = mkdtempSync(path.join(tmpdir(), "volcano-desktop-setup-"));
try {
  const server = path.join(sandbox, "server", "index.js");
  const skill = path.join(sandbox, "skills", "install-volcano", "SKILL.md");
  mkdirSync(path.dirname(server), { recursive: true });
  mkdirSync(path.dirname(skill), { recursive: true });
  copyFileSync("plugins/claude-desktop/server/index.js", server);
  writeFileSync(skill, setupSkill);
  assertSetup(runServer(server), setupSkill);

  const syncedSkill = "# Updated bundled setup skill\nFollow this synced version.\n";
  writeFileSync(skill, syncedSkill);
  assertSetup(runServer(server), syncedSkill);

  rmSync(skill);
  for (const response of runServer(server).slice(2)) {
    assert.equal(response.result?.isError, true, "Missing setup skill must stop setup");
    assert.match(response.result?.content?.[0]?.text ?? "", /Reinstall the extension package/);
    assert.doesNotMatch(response.result.content[0].text, /https?:\/\/|npm install|```/);
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

execFileSync("git", ["ls-files", "--stage", "plugins/claude-desktop/skills"], { stdio: "pipe" });
console.log("Claude Desktop manifest/server smoke test passed.");
