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

  const result = await runCli(["--version"], { binary: `true; touch ${marker}` });

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
    "  process.exit(7);",
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
