import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Freeze one committed tree. Never recurse through a developer worktree: even
// ignored files or an on-disk symlink under skills could expose local secrets.
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const prefix = "plugins/codex/";
const entries = [".codex-plugin/plugin.json", "skills", "assets", "LICENSE", "README.md"];
const tree = execFileSync("git", ["ls-tree", "-r", "-z", revision, "--", ...entries.map((entry) => prefix + entry)], { cwd: root, encoding: "utf8" });
const files = new Map();
for (const record of tree.split("\0").filter(Boolean)) {
  const separator = record.indexOf("\t");
  const header = record.slice(0, separator);
  const filename = record.slice(separator + 1);
  const [mode, type, sha] = header.split(" ");
  if (type !== "blob" || !["100644", "100755"].includes(mode)) {
    throw new Error(`Public package requires regular committed files: ${filename}`);
  }
  const relative = filename.slice(prefix.length);
  if (relative.split("/").some((part) => [".git", ".github", ".DS_Store"].includes(part))) continue;
  files.set(relative, { sha, mode });
}
function blob(relative) {
  const file = files.get(relative);
  if (!file) throw new Error(`Required public package file is not committed: ${relative}`);
  return execFileSync("git", ["cat-file", "blob", file.sha], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
}
const native = JSON.parse(blob(".codex-plugin/plugin.json").toString("utf8"));
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
try {
  mkdirSync(path.join(staging, ".codex-plugin"));
  for (const [relative, file] of files) {
    const destination = path.join(staging, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, blob(relative), { mode: file.mode === "100755" ? 0o755 : 0o644 });
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
  console.log(`Public skills-only plugin from ${revision}: ${output}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
