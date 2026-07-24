import * as vscode from "vscode";
import { runCli, isCliAvailable, fetchAgentsMd } from "@volcano-plugins/core";
import { getConfig, cliEnv, type ResolvedConfig } from "./vscode-config";

let output: vscode.OutputChannel;
let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Volcano");
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = "volcano.status";
  context.subscriptions.push(output, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("volcano.startBuilding", startBuilding),
    vscode.commands.registerCommand("volcano.login", login),
    vscode.commands.registerCommand("volcano.status", status),
    vscode.commands.registerCommand("volcano.install-volcano", installVolcano),
    vscode.commands.registerCommand(
      "volcano.showAgentInstructions",
      showAgentInstructions,
    ),
  );

  // Re-evaluate the status bar when settings change.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("volcano")) void refreshStatusBar();
    }),
  );

  void refreshStatusBar();
}

export function deactivate(): void {
  /* disposables handled by context.subscriptions */
}

// ── Status bar ──────────────────────────────────────────────────────────────

async function refreshStatusBar(): Promise<void> {
  const cfg = getConfig();
  const available = await isCliAvailable(cfg.cliPath);
  const devTag = cfg.isDev ? " (dev)" : "";

  if (available) {
    statusBar.text = `$(flame) Volcano${devTag}`;
    statusBar.tooltip = `Volcano CLI ready · ${cfg.webUrl}\nClick for status`;
    statusBar.command = "volcano.status";
  } else {
    statusBar.text = `$(flame) Volcano: set up`;
    statusBar.tooltip = `Volcano CLI not found. Click to install or upgrade.\n${cfg.webUrl}`;
    statusBar.command = "volcano.install-volcano";
  }
  statusBar.show();
}

// ── Commands ──────────────────────────────────────────────────────────────

async function startBuilding(): Promise<void> {
  const cfg = getConfig();
  const pick = await vscode.window.showQuickPick(
    [
      {
        label: "$(globe) Open Start Building guide",
        detail: `${cfg.webUrl}/startbuilding`,
        action: "guide" as const,
      },
      {
        label: "$(cloud-download) Install or upgrade Volcano CLI",
        detail: "Install the CLI if missing, or run volcano upgrade if present",
        action: "install" as const,
      },
      {
        label: "$(sign-in) Log in to Volcano",
        action: "login" as const,
      },
    ],
    { placeHolder: "Start building with Volcano" },
  );
  if (!pick) return;
  if (pick.action === "guide") {
    await vscode.env.openExternal(vscode.Uri.parse(`${cfg.webUrl}/startbuilding`));
  } else if (pick.action === "install") {
    await installVolcano();
  } else {
    await login();
  }
}

/** Interactive device-flow login runs in a terminal (it prompts the user). */
async function login(): Promise<void> {
  const cfg = getConfig();
  const terminal = vscode.window.createTerminal({
    name: "Volcano: login",
    env: cliEnv(cfg),
  });
  terminal.show();
  terminal.sendText(`${quote(cfg.cliPath)} login`);
}

/** Non-interactive status read; output to the channel. */
async function status(): Promise<void> {
  const cfg = getConfig();
  output.show(true);
  output.appendLine(`$ volcano status   (web: ${cfg.webUrl})`);

  const result = await runCli(["status"], {
    binary: cfg.cliPath,
    env: cliEnv(cfg),
    timeoutMs: 15000,
  });

  if (result.spawnError) {
    output.appendLine(`! CLI not found (${cfg.cliPath}). Run "Volcano: install-volcano".`);
    const choice = await vscode.window.showWarningMessage(
      "Volcano CLI not found.",
      "Install",
    );
    if (choice === "Install") await installVolcano();
    return;
  }
  if (result.stdout) output.appendLine(result.stdout.trimEnd());
  if (result.stderr) output.appendLine(result.stderr.trimEnd());
  output.appendLine(`(exit ${result.code})`);
  await refreshStatusBar();
}

/** Install or upgrade only the Volcano CLI. Plugin skills are shipped by plugin packages. */
async function installVolcano(): Promise<void> {
  const cfg = getConfig();
  const terminal = vscode.window.createTerminal({
    name: "Volcano: install-volcano",
    env: cliEnv(cfg),
  });
  terminal.show();
  terminal.sendText(installVolcanoShellCommand(cfg));
}

/**
 * Fetch the canonical AGENTS.md from the configured origin at runtime and open
 * it read-only. Demonstrates the no-bundled-content rule: nothing is shipped in
 * the extension, it is always pulled live from volcano.dev (or localhost in dev).
 */
async function showAgentInstructions(): Promise<void> {
  const cfg = getConfig();
  try {
    const md = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Fetching AGENTS.md…" },
      () => fetchAgentsMd(cfg.webUrl),
    );
    const doc = await vscode.workspace.openTextDocument({
      content: md,
      language: "markdown",
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Could not fetch AGENTS.md from ${cfg.webUrl}: ${errorMessage(err)}`,
    );
  }
}


const INSTALL_VOLCANO_SCRIPT = "set -eu\n\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL:-https://volcano.dev}\"\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL%/}\"\n\nlog() { printf '%s\\n' \"volcano: $*\"; }\nwarn() { printf '%s\\n' \"volcano: $*\" >&2; }\nhave() { command -v \"$1\" >/dev/null 2>&1; }\n\ndownload() {\n  url=\"$1\"\n  dest=\"$2\"\n  if have curl; then\n    curl -fsSL \"$url\" -o \"$dest\"\n  elif have wget; then\n    wget -qO \"$dest\" \"$url\"\n  else\n    warn \"need curl or wget to download the Volcano CLI\"\n    return 1\n  fi\n}\n\nvalid_agents_md() {\n  file=\"$1\"\n  [ -s \"$file\" ] || return 1\n  if head -c 200 \"$file\" | grep -qiE '<!doctype html|<html'; then\n    return 1\n  fi\n  grep -q 'Volcano' \"$file\" 2>/dev/null\n}\n\nis_plugin_skills_dir() {\n  dir=\"$1\"\n  [ -f \"$dir/AGENTS.md\" ] || return 1\n  [ -f \"$dir/index.json\" ] || return 1\n  [ -f \"$dir/volcano-platform/SKILL.md\" ] || return 1\n  valid_agents_md \"$dir/AGENTS.md\"\n}\n\nfind_plugin_skills_dir() {\n  # Explicit override for local/dev testing or IDEs that know their install path.\n  if [ -n \"${VOLCANO_PLUGIN_SKILLS_DIR:-}\" ] && is_plugin_skills_dir \"$VOLCANO_PLUGIN_SKILLS_DIR\"; then\n    printf '%s\\n' \"$VOLCANO_PLUGIN_SKILLS_DIR\"\n    return 0\n  fi\n\n  # Fast local cases: running from a plugin checkout or from inside skills/.\n  for dir in \"$PWD\" \"$PWD/skills\" \"$(dirname \"$PWD\")/skills\"; do\n    if is_plugin_skills_dir \"$dir\"; then\n      printf '%s\\n' \"$dir\"\n      return 0\n    fi\n  done\n\n  # Common marketplace/cache roots. Kept narrow so install doesn't scan all of $HOME.\n  for root in \\\n    \"$HOME/.codex/plugins\" \\\n    \"$HOME/.claude/plugins\" \\\n    \"$HOME/.claude\" \\\n    \"$HOME/.cursor\" \\\n    \"$HOME/.config\"; do\n    [ -d \"$root\" ] || continue\n    found=\"$(find \"$root\" -type f -path '*/skills/AGENTS.md' 2>/dev/null | while IFS= read -r file; do\n      dir=\"$(dirname \"$file\")\"\n      if is_plugin_skills_dir \"$dir\"; then\n        printf '%s\\n' \"$dir\"\n        break\n      fi\n    done)\"\n    if [ -n \"$found\" ]; then\n      printf '%s\\n' \"$found\"\n      return 0\n    fi\n  done\n\n  return 1\n}\n\nvalid_markdown_download() {\n  file=\"$1\"\n  [ -s \"$file\" ] || return 1\n  if head -c 200 \"$file\" | grep -qiE '<!doctype html|<html'; then\n    return 1\n  fi\n  return 0\n}\n\ninstall_manual_skills() {\n  mkdir -p \"$HOME/.volcano/skills\"\n  manifest=\"$(mktemp)\"\n  if ! download \"$VOLCANO_WEB_URL/skills/index.json\" \"$manifest\"; then\n    rm -f \"$manifest\"\n    warn \"skills manifest unavailable at $VOLCANO_WEB_URL/skills/index.json; ~/.volcano/skills not updated\"\n    return 1\n  fi\n  if head -c 200 \"$manifest\" | grep -qiE '<!doctype html|<html'; then\n    rm -f \"$manifest\"\n    warn \"$VOLCANO_WEB_URL/skills/index.json returned HTML, not a skills manifest; ~/.volcano/skills not updated\"\n    return 1\n  fi\n\n  names=\"$(grep -o '\"name\"[[:space:]]*:[[:space:]]*\"[^\"]*\"' \"$manifest\" | sed 's/.*\"\\([^\"]*\\)\"$/\\1/')\"\n  rm -f \"$manifest\"\n  if [ -z \"$names\" ]; then\n    warn \"skills manifest had no skill names; ~/.volcano/skills not updated\"\n    return 1\n  fi\n\n  for name in $names; do\n    case \"$name\" in\n      *[!A-Za-z0-9._-]*|'')\n        warn \"skipping invalid skill name from manifest: $name\"\n        continue\n        ;;\n    esac\n    dir=\"$HOME/.volcano/skills/$name\"\n    tmp=\"$(mktemp)\"\n    if download \"$VOLCANO_WEB_URL/skills/$name/SKILL.md\" \"$tmp\" && valid_markdown_download \"$tmp\"; then\n      mkdir -p \"$dir\"\n      mv \"$tmp\" \"$dir/SKILL.md\"\n      chmod 0644 \"$dir/SKILL.md\" 2>/dev/null || true\n      log \"installed runtime skill: ~/.volcano/skills/$name/SKILL.md\"\n    else\n      rm -f \"$tmp\"\n      warn \"skill download failed or invalid: $name\"\n    fi\n  done\n}\n\ninstall_volcano_content() {\n  mkdir -p \"$HOME/.volcano\"\n\n  if plugin_skills_dir=\"$(find_plugin_skills_dir 2>/dev/null)\"; then\n    cp \"$plugin_skills_dir/AGENTS.md\" \"$HOME/.volcano/AGENTS.md\"\n    chmod 0644 \"$HOME/.volcano/AGENTS.md\" 2>/dev/null || true\n    log \"installed fallback AGENTS.md from plugin skills: $plugin_skills_dir/AGENTS.md -> $HOME/.volcano/AGENTS.md\"\n    log \"using plugin-carried skills as primary source: $plugin_skills_dir\"\n    VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR=\"$plugin_skills_dir\"\n    export VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR\n    return 0\n  fi\n\n  log \"plugin-carried skills not found; installing runtime content under $HOME/.volcano\"\n  if ! valid_agents_md \"$HOME/.volcano/AGENTS.md\"; then\n    tmp=\"$HOME/.volcano/AGENTS.md.tmp\"\n    download \"$VOLCANO_WEB_URL/AGENTS.md\" \"$tmp\"\n    if ! valid_agents_md \"$tmp\"; then\n      rm -f \"$tmp\"\n      warn \"$VOLCANO_WEB_URL/AGENTS.md did not return a valid Markdown AGENTS.md\"\n      return 1\n    fi\n    mv \"$tmp\" \"$HOME/.volcano/AGENTS.md\"\n    chmod 0644 \"$HOME/.volcano/AGENTS.md\" 2>/dev/null || true\n    log \"installed runtime AGENTS.md to $HOME/.volcano/AGENTS.md\"\n  else\n    log \"using existing runtime AGENTS.md at $HOME/.volcano/AGENTS.md\"\n  fi\n\n  install_manual_skills\n}\n\nBEGIN_MARKER=\"# >>> VOLCANO MANAGED BLOCK (do not edit) >>>\"\nEND_MARKER=\"# <<< VOLCANO MANAGED BLOCK <<<\"\n\n# Emit $file with a *complete* managed block (begin + matching end) removed and\n# trailing blank lines trimmed. A begin marker with no matching end (a partial\n# write or a hand-edit) is NOT a well-formed block: its content is restored\n# verbatim rather than silently eaten. Crucially, a second begin marker closes\n# the first as malformed and starts a fresh candidate, so a file that has ended\n# up with two begins and one end (e.g. a prior run restored a dangling begin and\n# appended a complete block after it) never pairs the first begin with the later\n# end and eats the user content in between. Shared by upsert_block/remove_block.\nstrip_managed_block() {\n  awk -v b=\"$BEGIN_MARKER\" -v e=\"$END_MARKER\" '\n    $0==b {\n      if (inblk) { print b; for (i=1;i<=n;i++) print buf[i] }\n      inblk=1; n=0; next\n    }\n    inblk {\n      if ($0==e) { inblk=0; next }\n      buf[++n]=$0\n      next\n    }\n    { print }\n    END {\n      if (inblk) {\n        print b\n        for (i=1;i<=n;i++) print buf[i]\n      }\n    }\n  ' \"$1\" | awk 'NF{last=NR} {line[NR]=$0} END{for(i=1;i<=last;i++) print line[i]}'\n}\n\nupsert_block() {\n  file=\"$1\"\n  body=\"$2\"\n  mkdir -p \"$(dirname \"$file\")\"\n  [ -f \"$file\" ] || : >\"$file\"\n\n  if grep -qF \"$BEGIN_MARKER\" \"$file\" 2>/dev/null; then\n    action=\"updated\"\n  else\n    action=\"added\"\n  fi\n\n  tmp=\"$(mktemp)\"\n  strip_managed_block \"$file\" >\"$tmp\"\n  mv \"$tmp\" \"$file\"\n  [ -s \"$file\" ] && printf '\\n' >>\"$file\"\n  printf '%s\\n%s\\n%s\\n' \"$BEGIN_MARKER\" \"$body\" \"$END_MARKER\" >>\"$file\"\n  log \"$action managed Volcano block in $file\"\n}\n\n# Strip the managed block if present, leaving all other content intact. Used in\n# the plugin-first path: when the Volcano plugin is installed, the plugin is the\n# source of truth, so any managed block a prior no-plugin run left behind must go\n# (otherwise it keeps a second, independently-stale AGENTS.md always-on via an\n# @-import alongside the plugin).\nremove_block() {\n  file=\"$1\"\n  [ -f \"$file\" ] || return 0\n  grep -qF \"$BEGIN_MARKER\" \"$file\" 2>/dev/null || return 0\n  tmp=\"$(mktemp)\"\n  strip_managed_block \"$file\" >\"$tmp\"\n  mv \"$tmp\" \"$file\"\n  log \"removed stale managed Volcano block in $file (plugin present — plugin is the source of truth)\"\n}\n\n# Does Claude Code have the Volcano plugin installed? Read its authoritative\n# installed-plugins record rather than scanning for plugin-shaped files: the\n# marketplace clone carries the same files even when nothing is installed, so a\n# bare file scan false-positives on \"marketplace added but plugin not installed\".\nclaude_has_volcano_plugin() {\n  record=\"$HOME/.claude/plugins/installed_plugins.json\"\n  [ -f \"$record\" ] && grep -q '\"volcano@volcano-agentic-plugins\"' \"$record\"\n}\n\nwire_existing_claude_config() {\n  # Plugin-first: when the Claude Code plugin is installed it is the source of\n  # truth (its skills carry the guidance, loaded on demand). Wiring a\n  # ~/.volcano/AGENTS.md @-import here would just add a second, independently\n  # stale always-on copy that drifts once the plugin updates and ~/.volcano does\n  # not. So don't wire it — and strip any block a prior no-plugin run left behind.\n  if claude_has_volcano_plugin; then\n    log \"Claude Code Volcano plugin detected — plugin is the source of truth; not wiring ~/.volcano fallback\"\n    remove_block \"$HOME/.claude/CLAUDE.md\"\n    return 0\n  fi\n\n  # Claude Code supports @path imports. Only modify an existing global CLAUDE.md;\n  # plugin skills remain primary, ~/.volcano/AGENTS.md is the fallback.\n  [ -f \"$HOME/.claude/CLAUDE.md\" ] || return 0\n\n  plugin_line=\"\"\n  if [ -n \"${VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR:-}\" ] && is_plugin_skills_dir \"$VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR\"; then\n    plugin_line=\"@$VOLCANO_RESOLVED_PLUGIN_SKILLS_DIR/AGENTS.md\"\n  fi\n\n  body=\"Before any Volcano work, read the Volcano plugin-carried instructions first, then use ~/.volcano/AGENTS.md as the stable fallback/reference copy. The plugin skills directory remains the primary source for volcano-* skills; ~/.volcano/AGENTS.md is maintained during install as the durable fallback instruction file.\n\n$plugin_line\n@~/.volcano/AGENTS.md\"\n  upsert_block \"$HOME/.claude/CLAUDE.md\" \"$body\"\n}\n\nensure_cli_on_path() {\n  cli_dir=\"$1\"\n  case \":$PATH:\" in\n    *\":$cli_dir:\"*) ;;\n    *) PATH=\"$cli_dir:$PATH\"; export PATH ;;\n  esac\n\n  env_file=\"$HOME/.volcano/env\"\n  mkdir -p \"$(dirname \"$env_file\")\"\n  cat >\"$env_file\" <<ENV\n# Generated by Volcano plugin install-volcano. Adds the Volcano CLI install directory to PATH.\n# Source from your shell to make 'volcano' callable: . \"$env_file\"\ncase \":\\$PATH:\" in\n  *\":$cli_dir:\"*) ;;\n  *) export PATH=\"$cli_dir:\\$PATH\" ;;\nesac\nENV\n\n  marker_begin=\"# >>> volcano cli path >>>\"\n  marker_end=\"# <<< volcano cli path <<<\"\n  rc_added=\"\"\n  for rc in \"$HOME/.zshrc\" \"$HOME/.bashrc\" \"$HOME/.profile\"; do\n    [ -f \"$rc\" ] || continue\n    if grep -qF \"$marker_begin\" \"$rc\" 2>/dev/null; then\n      continue\n    fi\n    {\n      printf '\\n%s\\n' \"$marker_begin\"\n      printf '. \"%s\"\\n' \"$env_file\"\n      printf '%s\\n' \"$marker_end\"\n    } >>\"$rc\"\n    rc_added=\"$rc_added $rc\"\n  done\n  if [ -n \"$rc_added\" ]; then\n    log \"added Volcano PATH stub to:$rc_added\"\n  fi\n}\n\nnpm_global_bin_dir() {\n  if npm bin -g >/dev/null 2>&1; then\n    npm bin -g\n    return 0\n  fi\n\n  prefix=\"$(npm prefix -g 2>/dev/null || true)\"\n  [ -n \"$prefix\" ] || return 1\n  case \"$(uname -s | tr '[:upper:]' '[:lower:]')\" in\n    mingw*|msys*|cygwin*) printf '%s\\n' \"$prefix\" ;;\n    *) printf '%s/bin\\n' \"$prefix\" ;;\n  esac\n}\n\nnpm_managed_cli_installed() {\n  have npm && npm ls -g --depth=0 @volcano.dev/cli >/dev/null 2>&1\n}\n\ninstall_cli_from_npm() {\n  if ! have npm; then\n    warn \"npm not found; falling back to GitHub release download\"\n    return 1\n  fi\n\n  pkg=\"${VOLCANO_CLI_NPM_PACKAGE:-@volcano.dev/cli@latest}\"\n  log \"installing Volcano CLI from npm package $pkg\"\n  if ! npm install -g \"$pkg\"; then\n    warn \"npm install failed; falling back to GitHub release download\"\n    return 1\n  fi\n\n  bin_dir=\"$(npm_global_bin_dir 2>/dev/null || true)\"\n  if [ -n \"$bin_dir\" ]; then\n    ensure_cli_on_path \"$bin_dir\"\n  fi\n\n  if have volcano; then\n    log \"installed Volcano CLI from npm: $(command -v volcano)\"\n    return 0\n  fi\n\n  warn \"npm install completed but 'volcano' is not on PATH; falling back to GitHub release download\"\n  return 1\n}\n\ninstall_cli_from_release() {\n  os=\"$(uname -s | tr '[:upper:]' '[:lower:]')\"\n  case \"$os\" in\n    linux*) os=\"linux\" ;;\n    darwin*) os=\"macos\" ;;\n    mingw*|msys*|cygwin*) os=\"windows\" ;;\n    *) warn \"unsupported OS '$os'; cannot install Volcano CLI from GitHub release\"; return 1 ;;\n  esac\n\n  arch=\"$(uname -m)\"\n  case \"$arch\" in\n    x86_64|amd64) arch=\"amd64\" ;;\n    arm64|aarch64) arch=\"arm64\" ;;\n    *) warn \"unsupported arch '$arch'; cannot install Volcano CLI from GitHub release\"; return 1 ;;\n  esac\n\n  ext=\"\"\n  [ \"$os\" = \"windows\" ] && ext=\".exe\"\n\n  case \"$VOLCANO_WEB_URL\" in\n    *localhost*|*127.0.0.1*)\n      url=\"https://github.com/Kong/volcano-cli/releases/download/nightly/volcano-${os}-${arch}${ext}\"\n      log \"local Volcano web origin detected; using nightly GitHub CLI fallback\"\n      ;;\n    *)\n      url=\"https://github.com/Kong/volcano-cli/releases/latest/download/volcano-${os}-${arch}${ext}\"\n      ;;\n  esac\n\n  dir=\"${VOLCANO_INSTALL_DIR:-}\"\n  if [ -z \"$dir\" ]; then\n    if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then\n      dir=\"/usr/local/bin\"\n    else\n      dir=\"$HOME/.local/bin\"\n    fi\n  fi\n  mkdir -p \"$dir\"\n  out=\"$dir/volcano${ext}\"\n\n  log \"downloading Volcano CLI GitHub fallback ($os-$arch) from $url\"\n  download \"$url\" \"$out\"\n  chmod 0755 \"$out\" 2>/dev/null || true\n  ensure_cli_on_path \"$dir\"\n  log \"installed Volcano CLI GitHub fallback to $out\"\n}\n\nif have volcano; then\n  cli_path=\"$(command -v volcano)\"\n  ensure_cli_on_path \"$(dirname \"$cli_path\")\"\n  log \"found Volcano CLI at $cli_path\"\n  if npm_managed_cli_installed; then\n    log \"npm-managed Volcano CLI detected; refreshing through npm\"\n    install_cli_from_npm || warn \"npm refresh failed; continuing with existing CLI\"\n  else\n    log \"upgrading non-npm Volcano CLI with: volcano upgrade\"\n    volcano upgrade || warn \"volcano upgrade failed; continuing with existing CLI\"\n  fi\nelse\n  log \"Volcano CLI not found; installing from npm\"\n  install_cli_from_npm || install_cli_from_release\nfi\n\nif ! have volcano && [ -f \"$HOME/.volcano/env\" ]; then\n  # shellcheck disable=SC1090\n  . \"$HOME/.volcano/env\"\nfi\n\nif have volcano; then\n  log \"Volcano CLI ready: $(command -v volcano)\"\n  volcano --version || true\nelse\n  warn \"Volcano CLI installation did not leave 'volcano' on PATH. Try: . \\\"$HOME/.volcano/env\\\"\"\n  exit 1\nfi\n\ninstall_volcano_content\nwire_existing_claude_config";

function installVolcanoShellCommand(cfg: ResolvedConfig): string {
  return `VOLCANO_WEB_URL=${quote(cfg.webUrl)} sh <<'VOLCANO_INSTALL_EOF'
${INSTALL_VOLCANO_SCRIPT}
VOLCANO_INSTALL_EOF`;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function quote(value: string): string {
  return /[^A-Za-z0-9_./:-]/.test(value) ? `'${value.replace(/'/g, "'\\''")}'` : value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Keep ResolvedConfig referenced for type-only consumers/tests.
export type { ResolvedConfig };
