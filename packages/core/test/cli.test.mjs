import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.ts";

const printArgv = fileURLToPath(new URL("./fixtures/print-argv.mjs", import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), "volcano-core-cli-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

test("passes shell metacharacters to the child as literal arguments", async () => {
  const marker = path.join(scratch, "args-injected");
  const payloads = [
    `; touch ${marker}`,
    `$(touch ${marker})`,
    `\`touch ${marker}\``,
    `| touch ${marker} && echo`,
    "two words",
    `'single' "double" \\ $HOME *`,
    "%PATH% ^& echo",
    "line\nbreak",
    "",
  ];

  const result = await runCli([printArgv, ...payloads], { binary: process.execPath });

  assert.equal(result.spawnError, undefined);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), payloads);
  assert.equal(existsSync(marker), false);
});

test("treats the binary as a path, never as a shell command line", async () => {
  const marker = path.join(scratch, "binary-injected");

  // The trailing comment keeps a shell from handing `--version` to touch.
  const result = await runCli(["--version"], { binary: `true; touch ${marker} #` });

  assert.equal(result.spawnError?.code, "ENOENT");
  assert.equal(result.code, null);
  assert.equal(existsSync(marker), false);
});

test("keeps exit code, stdout, stderr and stdin handling", async () => {
  const script = [
    "let input = '';",
    "process.stdin.on('data', (chunk) => (input += chunk));",
    "process.stdin.on('end', () => {",
    "  process.stdout.write(input.toUpperCase());",
    "  process.stderr.write('warned');",
    "  process.exitCode = 7;",
    "});",
  ].join("\n");

  const result = await runCli(["-e", script], { binary: process.execPath, input: "hello" });

  assert.deepEqual(result, { code: 7, signal: null, stdout: "HELLO", stderr: "warned" });
});

test("terminates a child that outlives timeoutMs", async () => {
  const result = await runCli(["-e", "setTimeout(() => {}, 60_000)"], {
    binary: process.execPath,
    timeoutMs: 200,
  });

  assert.equal(result.code, null);
  assert.equal(result.signal, "SIGTERM");
});

// Wait on real time while runCli's setTimeout is mocked. Only setTimeout is mocked,
// so setImmediate and Date stay real.
async function waitForFile(file) {
  const deadline = Date.now() + 5000;
  while (!existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("escalates to SIGKILL when the child ignores SIGTERM", {
  skip: process.platform === "win32" && "Windows has no SIGTERM to ignore",
  timeout: 10_000,
}, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ready = path.join(scratch, "sigterm-ignored");

  // An ignored signal stays ignored across exec, so sleep keeps ignoring SIGTERM.
  // The timeout only fires once the trap is in place, so the test can't race it.
  const run = runCli(["-c", `trap '' TERM; : > "$0"; exec sleep 30`, ready], {
    binary: "/bin/sh",
    timeoutMs: 1000,
    killGraceMs: 1000,
  });
  await waitForFile(ready);
  t.mock.timers.tick(1000); // SIGTERM, ignored
  t.mock.timers.tick(1000); // SIGKILL
  const result = await run;

  assert.equal(result.code, null);
  assert.equal(result.signal, "SIGKILL");
});

test("stops waiting for output pipes that a descendant keeps open", {
  skip: process.platform === "win32" && "uses a POSIX shell",
  timeout: 10_000,
}, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ready = path.join(scratch, "descendant-started");

  // The backgrounded sleep inherits stdout and keeps it open after the shell is gone.
  const run = runCli(["-c", `sleep 30 & echo $!; : > "$0"; exit 0`, ready], {
    binary: "/bin/sh",
    timeoutMs: 1000,
    killGraceMs: 1000,
  });
  await waitForFile(ready);
  t.mock.timers.tick(1000); // SIGTERM
  t.mock.timers.tick(1000); // SIGKILL
  t.mock.timers.tick(1000); // stop waiting for the pipes
  const result = await run;
  const pid = Number(result.stdout);
  // Only signal a real descendant pid: kill(0) or kill(-1) would hit the test runner's group.
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  assert.match(result.stdout, /^\d+\n$/);
});

test("reports the exit of a child that stops reading stdin instead of throwing EPIPE", async () => {
  // More than a pipe buffer, so the write is still pending when the child exits.
  const input = "x".repeat(8 * 1024 * 1024);

  const result = await runCli(["-e", "process.exit(3)"], { binary: process.execPath, input });

  assert.equal(result.spawnError, undefined);
  assert.equal(result.code, 3);
});
