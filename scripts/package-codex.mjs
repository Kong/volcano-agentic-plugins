import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "plugins/codex");
const native = JSON.parse(readFileSync(path.join(source, ".codex-plugin/plugin.json"), "utf8"));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--version")) {
  throw new Error("Usage: pnpm package:codex [--version X.Y.Z]");
}
const version = args[1] ?? native.version;
// Public package revisions are explicit; never rewrite the repository release.
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error("Public package version must be an exact stable X.Y.Z version");
}
const { skills, interface: ui, review, publication, ...metadata } = native;
if (skills !== "./skills/" || !ui || !review || !publication) {
  throw new Error("Codex manifest must define bundled skills and public submission metadata");
}
const portable = {
  ...metadata,
  version,
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  extensions: { "com.openai": { interface: ui, publication, review } },
};
const staging = mkdtempSync(path.join(tmpdir(), "volcano-codex-"));
const excluded = new Set([".git", ".github", ".DS_Store"]);
try {
  mkdirSync(path.join(staging, ".codex-plugin"));
  // Allowlist package contents: no workspace state, credentials or MCP config.
  for (const entry of ["skills", "assets", "LICENSE", "README.md"]) {
    cpSync(path.join(source, entry), path.join(staging, entry), {
      recursive: true,
      filter: (src) => !excluded.has(path.basename(src)),
    });
  }
  writeFileSync(path.join(staging, "plugin.json"), JSON.stringify(portable, null, 2) + "\n");
  writeFileSync(path.join(staging, ".codex-plugin/plugin.json"), JSON.stringify({ ...native, version }, null, 2) + "\n");
  execFileSync(process.execPath, [path.join(staging, "skills/scripts/check-skills.mjs")], { stdio: "inherit" });
  // zip is available on the supported macOS/Linux packaging hosts and in CI.
  execFileSync("zip", ["-q", "-X", "-r", "package.zip", "plugin.json", ".codex-plugin", "skills", "assets", "LICENSE", "README.md"], { cwd: staging });
  const outputDir = path.join(root, "dist");
  mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, `volcano-${version}-public.zip`);
  // Copy within the destination filesystem before renaming: tmp may be on
  // another volume. Each staging directory gives this temporary file a unique name.
  const pending = path.join(outputDir, `${path.basename(staging)}.zip`);
  cpSync(path.join(staging, "package.zip"), pending);
  renameSync(pending, output);
  console.log(`Public skills-only plugin: ${output}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
