// Mirrors the Claude Code plugin directory's file policy for publishers that
// are not Verified organizations (LOCAL_CODE_FILE_TYPE). The directory refuses
// a version that ships any file outside these rules, so catch it here before a
// skills sync or new asset reaches a submission.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = "plugins/claude-code";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);
// Leading bytes for each allowed image type, so a file's content must match its name.
const IMAGE_SIGNATURES = {
  ".png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".webp": [[0x52, 0x49, 0x46, 0x46]],
  ".ico": [[0x00, 0x00, 0x01, 0x00]],
};
// The directory lets these through regardless of extension, as UTF-8 text.
const EXEMPT_TEXT_BASENAMES = /^(LICENSE|LICENCE|COPYING|README)(\.[A-Za-z]+)?$|^\.gitignore$/;
// Package manager configuration is refused even when its extension is allowed.
const PACKAGE_MANAGER_FILES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  ".yarnrc.yml",
  "composer.json",
  "deno.json",
  "requirements.txt",
]);

const utf8 = new TextDecoder("utf-8", { fatal: true });

function startsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function checkFile(relativePath, content) {
  const base = path.posix.basename(relativePath);
  const ext = path.posix.extname(base).toLowerCase();
  const problems = [];

  if (content[0] === 0x23 && content[1] === 0x21) problems.push("starts with #!");
  if (PACKAGE_MANAGER_FILES.has(base)) problems.push("is a package manager configuration file");

  if (IMAGE_SIGNATURES[ext]) {
    if (!IMAGE_SIGNATURES[ext].some((signature) => startsWith(content, signature))) {
      problems.push(`content is not a ${ext.slice(1).toUpperCase()} image`);
    }
    return problems;
  }

  if (!TEXT_EXTENSIONS.has(ext) && !EXEMPT_TEXT_BASENAMES.test(base)) {
    problems.push(`type ${ext || "(no extension)"} is not Markdown, text, JSON, YAML, or an allowed image`);
    return problems;
  }

  if (content.includes(0)) problems.push("contains a NUL byte");
  try {
    utf8.decode(content);
  } catch {
    problems.push("is not valid UTF-8");
  }
  return problems;
}

// Tracked files are what a marketplace clone receives; untracked local files
// (editor droppings, build output) are not shipped and are ignored here.
const tracked = execFileSync("git", ["ls-files", "-z", "--", pluginDir], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

if (tracked.length === 0) {
  console.error(`${pluginDir} has no tracked files`);
  process.exit(1);
}

const errors = [];
for (const file of tracked) {
  const relativePath = file.slice(pluginDir.length + 1);
  for (const problem of checkFile(relativePath, readFileSync(path.join(root, file)))) {
    errors.push(`${file}: ${problem}`);
  }
}

if (errors.length > 0) {
  console.error("Claude Code plugin ships files the plugin directory refuses from unverified publishers:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Claude Code plugin file allowlist check passed (${tracked.length} files).`);
