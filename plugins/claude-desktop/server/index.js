#!/usr/bin/env node
/*
 * Minimal MCP stdio server for the Volcano Claude Desktop extension.
 *
 * This is intentionally not the full Volcano MCP action surface. It provides
 * setup/instruction tools only, while the Volcano CLI remains the action path.
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(EXTENSION_ROOT, "skills");

function text(content) {
  return { content: [{ type: "text", text: content }] };
}

function setupInstructions() {
  const skill = path.join(SKILLS_DIR, "install-volcano", "SKILL.md");
  if (!fs.existsSync(skill)) {
    return {
      ...text("The bundled install-volcano skill is missing. Stop setup. Reinstall the extension package; do not download replacement instructions."),
      isError: true,
    };
  }
  return text(fs.readFileSync(skill, "utf8"));
}

function readAgentInstructions() {
  const agents = path.join(SKILLS_DIR, "AGENTS.md");
  if (fs.existsSync(agents)) return fs.readFileSync(agents, "utf8");
  return `AGENTS.md is not present in ${SKILLS_DIR}. Reinstall the extension package or run install-volcano for CLI setup.`;
}

function skillIndex() {
  const indexPath = path.join(SKILLS_DIR, "index.json");
  if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, "utf8");

  if (!fs.existsSync(SKILLS_DIR)) {
    return `Skills directory not found: ${SKILLS_DIR}`;
  }

  const names = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(SKILLS_DIR, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();

  return JSON.stringify({ skills: names }, null, 2);
}

const tools = [
  {
    name: "install-volcano",
    description: "Return the bundled, verified Volcano CLI setup skill.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "volcano_setup_instructions",
    description: "Return the bundled, verified Volcano CLI setup skill.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "volcano_agent_instructions",
    description: "Return the canonical Volcano agent instructions from this extension's packaged skills directory.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "volcano_skill_index",
    description: "List the canonical Volcano skills included in this extension's packaged skills directory.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "volcano", version: "0.0.1" },
      },
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools } };
  }

  if (method === "tools/call") {
    const name = params?.name;
    if (name === "install-volcano" || name === "volcano_setup_instructions") {
      return { jsonrpc: "2.0", id, result: setupInstructions() };
    }
    if (name === "volcano_agent_instructions") {
      return { jsonrpc: "2.0", id, result: text(readAgentInstructions()) };
    }
    if (name === "volcano_skill_index") {
      return { jsonrpc: "2.0", id, result: text(skillIndex()) };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: `Unknown tool: ${name}` },
    };
  }

  // Notifications (e.g. initialized) have no id and require no response.
  if (id === undefined || id === null) return undefined;

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const message = JSON.parse(line);
    const response = handleRequest(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : String(error) },
      })}\n`,
    );
  }
});
