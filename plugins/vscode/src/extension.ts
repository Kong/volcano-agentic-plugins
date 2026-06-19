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
    vscode.commands.registerCommand("volcano.runBootstrap", runBootstrap),
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
    statusBar.tooltip = `Volcano CLI not found. Click to install.\n${cfg.webUrl}`;
    statusBar.command = "volcano.runBootstrap";
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
        label: "$(cloud-download) Install CLI & skills (bootstrap)",
        detail: "Run the bootstrap script in a terminal",
        action: "bootstrap" as const,
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
  } else if (pick.action === "bootstrap") {
    await runBootstrap();
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
    output.appendLine(`! CLI not found (${cfg.cliPath}). Run "Volcano: Install CLI & Skills".`);
    const choice = await vscode.window.showWarningMessage(
      "Volcano CLI not found.",
      "Install",
    );
    if (choice === "Install") await runBootstrap();
    return;
  }
  if (result.stdout) output.appendLine(result.stdout.trimEnd());
  if (result.stderr) output.appendLine(result.stderr.trimEnd());
  output.appendLine(`(exit ${result.code})`);
  await refreshStatusBar();
}

/** Bootstrap install — runs the script from the configured origin in a terminal. */
async function runBootstrap(): Promise<void> {
  const cfg = getConfig();
  const terminal = vscode.window.createTerminal({
    name: "Volcano: bootstrap",
    env: cliEnv(cfg),
  });
  terminal.show();
  const url = `${cfg.webUrl}/bootstrap.sh`;
  terminal.sendText(
    `curl -fsSL ${quote(url)} -o /tmp/volcano-bootstrap.sh && sh /tmp/volcano-bootstrap.sh --apply`,
  );
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

// ── helpers ─────────────────────────────────────────────────────────────────

function quote(value: string): string {
  return /[^A-Za-z0-9_./:-]/.test(value) ? `'${value.replace(/'/g, "'\\''")}'` : value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Keep ResolvedConfig referenced for type-only consumers/tests.
export type { ResolvedConfig };
