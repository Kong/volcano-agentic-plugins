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
    vscode.commands.registerCommand("volcano.installVolcano", installVolcano),
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
    statusBar.command = "volcano.installVolcano";
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
    output.appendLine(`! CLI not found (${cfg.cliPath}). Run "Volcano: Install Volcano".`);
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
    name: "Volcano: install",
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


const INSTALL_VOLCANO_SCRIPT = "set -eu\n\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL:-https://volcano.dev}\"\nVOLCANO_WEB_URL=\"${VOLCANO_WEB_URL%/}\"\n\nlog() { printf '%s\\n' \"volcano: $*\"; }\nwarn() { printf '%s\\n' \"volcano: $*\" >&2; }\nhave() { command -v \"$1\" >/dev/null 2>&1; }\n\ndownload() {\n  url=\"$1\"\n  dest=\"$2\"\n  if have curl; then\n    curl -fsSL \"$url\" -o \"$dest\"\n  elif have wget; then\n    wget -qO \"$dest\" \"$url\"\n  else\n    warn \"need curl or wget to download the Volcano CLI\"\n    return 1\n  fi\n}\n\nensure_cli_on_path() {\n  cli_dir=\"$1\"\n  case \":$PATH:\" in\n    *\":$cli_dir:\"*) ;;\n    *) PATH=\"$cli_dir:$PATH\"; export PATH ;;\n  esac\n\n  env_file=\"$HOME/.volcano/env\"\n  mkdir -p \"$(dirname \"$env_file\")\"\n  cat >\"$env_file\" <<ENV\n# Generated by Volcano plugin install-volcano. Adds the Volcano CLI install directory to PATH.\n# Source from your shell to make 'volcano' callable: . \"$env_file\"\ncase \":\\$PATH:\" in\n  *\":$cli_dir:\"*) ;;\n  *) export PATH=\"$cli_dir:\\$PATH\" ;;\nesac\nENV\n\n  marker_begin=\"# >>> volcano cli path >>>\"\n  marker_end=\"# <<< volcano cli path <<<\"\n  rc_added=\"\"\n  for rc in \"$HOME/.zshrc\" \"$HOME/.bashrc\" \"$HOME/.profile\"; do\n    [ -f \"$rc\" ] || continue\n    if grep -qF \"$marker_begin\" \"$rc\" 2>/dev/null; then\n      continue\n    fi\n    {\n      printf '\\n%s\\n' \"$marker_begin\"\n      printf '. \"%s\"\\n' \"$env_file\"\n      printf '%s\\n' \"$marker_end\"\n    } >>\"$rc\"\n    rc_added=\"$rc_added $rc\"\n  done\n  if [ -n \"$rc_added\" ]; then\n    log \"added Volcano PATH stub to:$rc_added\"\n  fi\n}\n\ninstall_cli_from_release() {\n  os=\"$(uname -s | tr '[:upper:]' '[:lower:]')\"\n  case \"$os\" in\n    linux*) os=\"linux\" ;;\n    darwin*) os=\"macos\" ;;\n    mingw*|msys*|cygwin*) os=\"windows\" ;;\n    *) warn \"unsupported OS '$os'; cannot install Volcano CLI\"; return 1 ;;\n  esac\n\n  arch=\"$(uname -m)\"\n  case \"$arch\" in\n    x86_64|amd64) arch=\"amd64\" ;;\n    arm64|aarch64) arch=\"arm64\" ;;\n    *) warn \"unsupported arch '$arch'; cannot install Volcano CLI\"; return 1 ;;\n  esac\n\n  ext=\"\"\n  [ \"$os\" = \"windows\" ] && ext=\".exe\"\n\n  case \"$VOLCANO_WEB_URL\" in\n    *localhost*|*127.0.0.1*)\n      url=\"https://github.com/Kong/volcano-cli/releases/download/nightly/volcano-${os}-${arch}${ext}\"\n      log \"local Volcano web origin detected; installing nightly CLI channel\"\n      ;;\n    *)\n      url=\"https://github.com/Kong/volcano-cli/releases/latest/download/volcano-${os}-${arch}${ext}\"\n      ;;\n  esac\n\n  dir=\"${VOLCANO_INSTALL_DIR:-}\"\n  if [ -z \"$dir\" ]; then\n    if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then\n      dir=\"/usr/local/bin\"\n    else\n      dir=\"$HOME/.local/bin\"\n    fi\n  fi\n  mkdir -p \"$dir\"\n  out=\"$dir/volcano${ext}\"\n\n  log \"downloading Volcano CLI ($os-$arch) from $url\"\n  download \"$url\" \"$out\"\n  chmod 0755 \"$out\" 2>/dev/null || true\n  ensure_cli_on_path \"$dir\"\n  log \"installed Volcano CLI to $out\"\n}\n\nif have volcano; then\n  log \"found Volcano CLI at $(command -v volcano)\"\n  log \"upgrading Volcano CLI with: volcano upgrade\"\n  volcano upgrade\nelse\n  log \"Volcano CLI not found; installing latest release\"\n  install_cli_from_release\nfi\n\nif ! have volcano && [ -f \"$HOME/.volcano/env\" ]; then\n  . \"$HOME/.volcano/env\"\nfi\n\nif have volcano; then\n  log \"Volcano CLI ready: $(command -v volcano)\"\n  volcano --version || true\nelse\n  warn \"Volcano CLI installation did not leave 'volcano' on PATH. Try: . \\\"$HOME/.volcano/env\\\"\"\n  exit 1\nfi";

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
