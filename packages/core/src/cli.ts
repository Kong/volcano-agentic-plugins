/**
 * Volcano CLI runner. Plugins drive the `volcano` binary rather than
 * re-implementing any command. This module only spawns it and captures output.
 */

import { spawn } from "node:child_process";

export interface RunCliOptions {
  /** Override the binary name/path. Defaults to "volcano". */
  binary?: string;
  cwd?: string;
  /** Extra env merged over process.env (e.g. VOLCANO_API_URL for dev). */
  env?: Record<string, string | undefined>;
  /** Kill the process after this many ms. */
  timeoutMs?: number;
  /** stdin to write, if any. */
  input?: string;
}

export interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** True when the binary could not be spawned (e.g. not installed). */
  spawnError?: Error;
}

export const DEFAULT_CLI_BINARY = "volcano";

/**
 * Run `volcano <args>` and resolve with captured output. Never rejects for a
 * non-zero exit; inspect `code`/`stderr`. Rejects only on internal misuse.
 */
export function runCli(
  args: string[],
  opts: RunCliOptions = {},
): Promise<CliResult> {
  const binary = opts.binary?.trim() || DEFAULT_CLI_BINARY;

  return new Promise<CliResult>((resolve) => {
    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: CliResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, opts.timeoutMs);
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", (spawnError) => {
      finish({ code: null, signal: null, stdout, stderr, spawnError });
    });

    child.on("close", (code, signal) => {
      finish({ code, signal, stdout, stderr });
    });

    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/** Whether the CLI binary is invocable (resolves a version). */
export async function isCliAvailable(binary?: string): Promise<boolean> {
  const result = await runCli(["--version"], { binary, timeoutMs: 5000 });
  return !result.spawnError && result.code === 0;
}

/** Best-effort CLI version string, or undefined if unavailable. */
export async function cliVersion(binary?: string): Promise<string | undefined> {
  const result = await runCli(["--version"], { binary, timeoutMs: 5000 });
  if (result.spawnError || result.code !== 0) return undefined;
  return result.stdout.trim() || result.stderr.trim() || undefined;
}
