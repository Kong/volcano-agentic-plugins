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

function cliInstallScript() {
  return "set -eu\n\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL:-https://volcano.dev}\"\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL%/}\"\n\nlog() { printf '%s\\n' \"volcano: $*\"; }\nwarn() { printf '%s\\n' \"volcano: $*\" >&2; }\nhave() { command -v \"$1\" >/dev/null 2>&1; }\n\ndownload() {\n  url=\"$1\"\n  dest=\"$2\"\n  if have curl; then\n    curl -fsSL \"$url\" -o \"$dest\"\n  elif have wget; then\n    wget -qO \"$dest\" \"$url\"\n  else\n    warn \"need curl or wget to download the Volcano CLI\"\n    return 1\n  fi\n}\n\nvalid_agents_md() {\n  file=\"$1\"\n  [ -s \"$file\" ] || return 1\n  if head -c 200 \"$file\" | grep -qiE '<!doctype html|<html'; then\n    return 1\n  fi\n  grep -q 'Volcano' \"$file\" 2>/dev/null\n}\n\nis_plugin_skills_dir() {\n  dir=\"$1\"\n  [ -f \"$dir/AGENTS.md\" ] || return 1\n  [ -f \"$dir/index.json\" ] || return 1\n  [ -f \"$dir/volcano-platform/SKILL.md\" ] || return 1\n  valid_agents_md \"$dir/AGENTS.md\"\n}\n\nfind_plugin_skills_dir() {\n  # Explicit override for local/dev testing or IDEs that know their install path.\n  if [ -n \"${VOLCANO_PLUGIN_SKILLS_DIR:-}\" ] && is_plugin_skills_dir \"$VOLCANO_PLUGIN_SKILLS_DIR\"; then\n    printf '%s\\n' \"$VOLCANO_PLUGIN_SKILLS_DIR\"\n    return 0\n  fi\n\n  # Fast local cases: running from a plugin checkout or from inside skills/.\n  for dir in \"$PWD\" \"$PWD/skills\" \"$(dirname \"$PWD\")/skills\"; do\n    if is_plugin_skills_dir \"$dir\"; then\n      printf '%s\\n' \"$dir\"\n      return 0\n    fi\n  done\n\n  # Common marketplace/cache roots. Kept narrow so install doesn't scan all of $HOME.\n  for root in \\\n    \"$HOME/.codex/plugins\" \\\n    \"$HOME/.claude/plugins\" \\\n    \"$HOME/.claude\" \\\n    \"$HOME/.cursor\" \\\n    \"$HOME/.config\"; do\n    [ -d \"$root\" ] || continue\n    found=\"$(find \"$root\" -type f -path '*/skills/AGENTS.md' 2>/dev/null | while IFS= read -r file; do\n      dir=\"$(dirname \"$file\")\"\n      if is_plugin_skills_dir \"$dir\"; then\n        printf '%s\\n' \"$dir\"\n        break\n      fi\n    done)\"\n    if [ -n \"$found\" ]; then\n      printf '%s\\n' \"$found\"\n      return 0\n    fi\n  done\n\n  return 1\n}\n\nvalid_markdown_download() {\n  file=\"$1\"\n  [ -s \"$file\" ] || return 1\n  if head -c 200 \"$file\" | grep -qiE '<!doctype html|<html'; then\n    return 1\n  fi\n  return 0\n}\n\ninstall_manual_skills() {\n  mkdir -p \"$HOME/.volcano/skills\"\n  manifest=\"$(mktemp)\"\n  if ! download \"$VOLCANO_WEB_URL/skills/index.json\" \"$manifest\"; then\n    rm -f \"$manifest\"\n    warn \"skills manifest unavailable at $VOLCANO_WEB_URL/skills/index.json; ~/.volcano/skills not updated\"\n    return 1\n  fi\n  if head -c 200 \"$manifest\" | grep -qiE '<!doctype html|<html'; then\n    rm -f \"$manifest\"\n    warn \"$VOLCANO_WEB_URL/skills/index.json returned HTML, not a skills manifest; ~/.volcano/skills not updated\"\n    return 1\n  fi\n\n  names=\"$(grep -o '\"name\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' \"$manifest\" | sed 's/.*\"\\([^\"]*\\)\"$/\\1/')\"\n  rm -f \"$manifest\"\n  if [ -z \"$names\" ]; then\n    warn \"skills manifest had no skill names; ~/.volcano/skills not updated\"\n    return 1\n  fi\n\n  for name in $names; do\n    case \"$name\" in\n      *[!A-Za-z0-9._-]*|'')\n        warn \"skipping invalid skill name from manifest: $name\"\n        continue\n        ;;\n    esac\n    dir=\"$HOME/.volcano/skills/$name\"\n    tmp=\"$(mktemp)\"\n    if download \"$VOLCANO_WEB_URL/skills/$name/SKILL.md\" \"$tmp\" && valid_markdown_download \"$tmp\"; then\n      mkdir -p \"$dir\"\n      mv \"$tmp\" \"$dir/SKILL.md\"\n      chmod 0644 \"$dir/SKILL.md\" 2>/dev/null || true\n      log \"installed runtime skill: ~/.volcano/skills/$name/SKILL.md\"\n    else\n      rm -f \"$tmp\"\n      warn \"skill download failed or invalid: $name\"\n    fi\n  done\n}\n\ninstall_volcano_content() {\n  mkdir -p \"$HOME/.volcano\"\n\n  if plugin_skills_dir=\"$(find_plugin_skills_dir 2>/dev/null)\"; then\n    cp \"$plugin_skills_dir/AGENTS.md\" \"$HOME/.volcano/AGENTS.md\"\n    chmod 0644 \"$HOME/.volcano/AGENTS.md\" 2>/dev/null || true\n    log \"installed fallback AGENTS.md from plugin skills: $plugin_skills_dir/AGENTS.md -> $HOME/.volcano/AGENTS.md\"\n    log \"using plugin-carried skills as primary source: $plugin_skills_dir\"\n    VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR=\"$plugin_skills_dir\"\n    export VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR\n    return 0\n  fi\n\n  log \"plugin-carried skills not found; installing runtime content under $HOME/.volcano\"\n  if ! valid_agents_md \"$HOME/.volcano/AGENTS.md\"; then\n    tmp=\"$HOME/.volcano/AGENTS.md.tmp\"\n    download \"$VOLCANO_WEB_URL/AGENTS.md\" \"$tmp\"\n    if ! valid_agents_md \"$tmp\"; then\n      rm -f \"$tmp\"\n      warn \"$VOLCANO_WEB_URL/AGENTS.md did not return a valid Markdown AGENTS.md\"\n      return 1\n    fi\n    mv \"$tmp\" \"$HOME/.volcano/AGENTS.md\"\n    chmod 0644 \"$HOME/.volcano/AGENTS.md\" 2>/dev/null || true\n    log \"installed runtime AGENTS.md to $HOME/.volcano/AGENTS.md\"\n  else\n    log \"using existing runtime AGENTS.md at $HOME/.volcano/AGENTS.md\"\n  fi\n\n  install_manual_skills\n}\n\nupsert_block() {\n  file=\"$1\"\n  body=\"$2\"\n  marker_begin=\"# >>> VOLCANO MANAGED BLOCK (do not edit) >>>\"\n  marker_end=\"# <<< VOLCANO MANAGED BLOCK <<<\"\n  mkdir -p \"$(dirname \"$file\")\"\n  [ -f \"$file\" ] || : >\"$file\"\n\n  if grep -qF \"$marker_begin\" \"$file\" 2>/dev/null; then\n    action=\"updated\"\n  else\n    action=\"added\"\n  fi\n\n  tmp=\"$(mktemp)\"\n  awk -v b=\"$marker_begin\" -v e=\"$marker_end\" '\n    $0==b {inblk=1; next}\n    $0==e {inblk=0; next}\n    !inblk {print}\n  ' \"$file\" | awk 'NF{last=NR} {line[NR]=$0} END{for(i=1;i<=last;i++) print line[i]}' >\"$tmp\"\n  mv \"$tmp\" \"$file\"\n  [ -s \"$file\" ] && printf '\\n' >>\"$file\"\n  printf '%s\\n%s\\n%s\\n' \"$marker_begin\" \"$body\" \"$marker_end\" >>\"$file\"\n  log \"$action managed Volcano block in $file\"\n}\n\nwire_existing_claude_config() {\n  # Claude Code supports @path imports. Only modify an existing global CLAUDE.md;\n  # plugin skills remain primary, ~/.volcano/AGENTS.md is the fallback.\n  [ -f \"$HOME/.claude/CLAUDE.md\" ] || return 0\n\n  plugin_line=\"\"\n  if [ -n \"${VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR:-}\" ] && is_plugin_skills_dir \"$VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR\"; then\n    plugin_line=\"@$VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR/AGENTS.md\"\n  fi\n\n  body=\"Before any Volcano work, read the Volcano plugin-carried instructions first, then use ~/.volcano/AGENTS.md as the stable fallback/reference copy. The plugin skills directory remains the primary source for volcano-* skills; ~/.volcano/AGENTS.md is maintained during install as the durable fallback instruction file.\n\n$plugin_line\n@~/.volcano/AGENTS.md\"\n  upsert_block \"$HOME/.claude/CLAUDE.md\" \"$body\"\n}\n\nensure_cli_on_path() {\n  cli_dir=\"$1\"\n  case \":$PATH:\" in\n    *\":$cli_dir:\"*) ;;\n    *) PATH=\"$cli_dir:$PATH\"; export PATH ;;\n  esac\n\n  env_file=\"$HOME/.volcano/env\"\n  mkdir -p \"$(dirname \"$env_file\")\"\n  cat >\"$env_file\" <<ENV\n# Generated by Volcano plugin install-volcano. Adds the Volcano CLI install directory to PATH.\n# Source from your shell to make 'volcano' callable: . \"$env_file\"\ncase \":\\$PATH:\" in\n  *\":$cli_dir:\"*) ;;\n  *) export PATH=\"$cli_dir:\\$PATH\" ;;\nesac\nENV\n\n  marker_begin=\"# >>> volcano cli path >>>\"\n  marker_end=\"# <<< volcano cli path <<<\"\n  rc_added=\"\"\n  for rc in \"$HOME/.zshrc\" \"$HOME/.bashrc\" \"$HOME/.profile\"; do\n    [ -f \"$rc\" ] || continue\n    if grep -qF \"$marker_begin\" \"$rc\" 2>/dev/null; then\n      continue\n    fi\n    {\n      printf '\\n%s\\n' \"$marker_begin\"\n      printf '. \"%s\"\\n' \"$env_file\"\n      printf '%s\\n' \"$marker_end\"\n    } >>\"$rc\"\n    rc_added=\"$rc_added $rc\"\n  done\n  if [ -n \"$rc_added\" ]; then\n    log \"added Volcano PATH stub to:$rc_added\"\n  fi\n}\n\nnpm_global_bin_dir() {\n  if npm bin -g >/dev/null 2>&1; then\n    npm bin -g\n    return 0\n  fi\n\n  prefix=\"$(npm prefix -g 2>/dev/null || true)\"\n  [ -n \"$prefix\" ] || return 1\n  case \"$(uname -s | tr '[:upper:]' '[:lower:]')\" in\n    mingw*|msys*|cygwin*) printf '%s\\n' \"$prefix\" ;;\n    *) printf '%s/bin\\n' \"$prefix\" ;;\n  esac\n}\n\nnpm_managed_cli_installed() {\n  have npm && npm ls -g --depth=0 @volcano.dev/cli >/dev/null 2>&1\n}\n\ninstall_cli_from_npm() {\n  if ! have npm; then\n    warn \"npm not found; falling back to GitHub release download\"\n    return 1\n  fi\n\n  pkg=\"${VOLCANO_CLI_NPM_PACKAGE:-@volcano.dev/cli@latest}\"\n  log \"installing Volcano CLI from npm package $pkg\"\n  if ! npm install -g \"$pkg\"; then\n    warn \"npm install failed; falling back to GitHub release download\"\n    return 1\n  fi\n\n  bin_dir=\"$(npm_global_bin_dir 2>/dev/null || true)\"\n  if [ -n \"$bin_dir\" ]; then\n    ensure_cli_on_path \"$bin_dir\"\n  fi\n\n  if have volcano; then\n    log \"installed Volcano CLI from npm: $(command -v volcano)\"\n    return 0\n  fi\n\n  warn \"npm install completed but 'volcano' is not on PATH; falling back to GitHub release download\"\n  return 1\n}\n\ninstall_cli_from_release() {\n  os=\"$(uname -s | tr '[:upper:]' '[:lower:]')\"\n  case \"$os\" in\n    linux*) os=\"linux\" ;;\n    darwin*) os=\"macos\" ;;\n    mingw*|msys*|cygwin*) os=\"windows\" ;;\n    *) warn \"unsupported OS '$os'; cannot install Volcano CLI from GitHub release\"; return 1 ;;\n  esac\n\n  arch=\"$(uname -m)\"\n  case \"$arch\" in\n    x86_64|amd64) arch=\"amd64\" ;;\n    arm64|aarch64) arch=\"arm64\" ;;\n    *) warn \"unsupported arch '$arch'; cannot install Volcano CLI from GitHub release\"; return 1 ;;\n  esac\n\n  ext=\"\"\n  [ \"$os\" = \"windows\" ] && ext=\".exe\"\n\n  case \"$VOLCANO_WEB_URL\" in\n    *localhost*|*127.0.0.1*)\n      url=\"https://github.com/Kong/volcano-cli/releases/download/nightly/volcano-${os}-${arch}${ext}\"\n      log \"local Volcano web origin detected; using nightly GitHub CLI fallback\"\n      ;;\n    *)\n      url=\"https://github.com/Kong/volcano-cli/releases/latest/download/volcano-${os}-${arch}${ext}\"\n      ;;\n  esac\n\n  dir=\"${VOLCANO_INSTALL_DIR:-}\"\n  if [ -z \"$dir\" ]; then\n    if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then\n      dir=\"/usr/local/bin\"\n    else\n      dir=\"$HOME/.local/bin\"\n    fi\n  fi\n  mkdir -p \"$dir\"\n  out=\"$dir/volcano${ext}\"\n\n  log \"downloading Volcano CLI GitHub fallback ($os-$arch) from $url\"\n  download \"$url\" \"$out\"\n  chmod 0755 \"$out\" 2>/dev/null || true\n  ensure_cli_on_path \"$dir\"\n  log \"installed Volcano CLI GitHub fallback to $out\"\n}\n\nif have volcano; then\n  cli_path=\"$(command -v volcano)\"\n  ensure_cli_on_path \"$(dirname \"$cli_path\")\"\n  log \"found Volcano CLI at $cli_path\"\n  if npm_managed_cli_installed; then\n    log \"npm-managed Volcano CLI detected; refreshing through npm\"\n    install_cli_from_npm || warn \"npm refresh failed; continuing with existing CLI\"\n  else\n    log \"upgrading non-npm Volcano CLI with: volcano upgrade\"\n    volcano upgrade || warn \"volcano upgrade failed; continuing with existing CLI\"\n  fi\nelse\n  log \"Volcano CLI not found; installing from npm\"\n  install_cli_from_npm || install_cli_from_release\nfi\n\nif ! have volcano && [ -f \"$HOME/.volcano/env\" ]; then\n  # shellcheck disable=SC1090\n  . \"$HOME/.volcano/env\"\nfi\n\nif have volcano; then\n  log \"Volcano CLI ready: $(command -v volcano)\"\n  volcano --version || true\nelse\n  warn \"Volcano CLI installation did not leave 'volcano' on PATH. Try: . \\\"$HOME/.volcano/env\\\"\"\n  exit 1\nfi\n\ninstall_volcano_content\nwire_existing_claude_config";
}

function setupInstructions() {
  const script = cliInstallScript();
  return [
    "# Install or upgrade Volcano for Claude Desktop",
    "",
    "Run this command in a terminal. It upgrades an existing volcano CLI with `volcano upgrade`, or installs `@volcano.dev/cli` from npm if missing (GitHub release download is fallback).",
    "The Claude Desktop extension already ships Volcano skills, so this does not download skills into `~/.volcano/skills`.",
    "",
    "```sh",
    script,
    "```",
    "",
    "After it completes:",
    "",
    "1. Verify `which volcano` succeeds.",
    "2. Use the Volcano skills shipped with this Claude Desktop extension.",
    "",
    "Safety: production deploys, deletions, secret/variable changes, permission/visibility changes, custom domains, and billing/account changes require explicit user confirmation.",
  ].join("\n");
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
    description: "Return the one-step Volcano CLI install/upgrade command for Claude Desktop.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "volcano_setup_instructions",
    description: "Return the canonical command for installing or upgrading the Volcano CLI.",
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
      return { jsonrpc: "2.0", id, result: text(setupInstructions()) };
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
