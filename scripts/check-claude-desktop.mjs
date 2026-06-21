import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
]
  .map((message) => JSON.stringify(message))
  .join("\n") + "\n";

const result = spawnSync("node", ["plugins/claude-desktop/server/index.js"], {
  input,
  encoding: "utf8",
});
if (result.status !== 0) {
  throw new Error(`Claude Desktop server exited ${result.status}: ${result.stderr}`);
}
const responses = result.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
if (responses.length !== 3) throw new Error(`Expected 3 MCP responses, got ${responses.length}`);
if (!responses[0].result?.capabilities?.tools) throw new Error("initialize response missing tools capability");
const tools = responses[1].result?.tools?.map((tool) => tool.name) ?? [];
for (const tool of ["volcano_setup_instructions", "volcano_agent_instructions", "volcano_skill_index"]) {
  if (!tools.includes(tool)) throw new Error(`tools/list missing ${tool}`);
}
if (!responses[2].result?.content?.[0]?.text?.includes("bootstrap.sh")) {
  throw new Error("volcano_setup_instructions did not return bootstrap instructions");
}

execFileSync("git", ["ls-files", "--stage", "plugins/claude-desktop/skills"], { stdio: "pipe" });
console.log("Claude Desktop manifest/server smoke test passed.");
