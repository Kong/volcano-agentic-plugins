// Mirrors the Claude Code plugin directory's file policy for publishers that
// are not Verified organizations (LOCAL_CODE_FILE_TYPE). The directory refuses
// a version that ships any file outside these rules, so catch it here before a
// skills sync or new asset reaches a submission.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = "plugins/claude-code";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);
// Byte patterns ([offset, bytes] pairs) for each allowed image type, so a
// file's content must match its name. WebP also needs the WEBP form type at
// byte 8, since RIFF alone also starts WAV and AVI files.
const IMAGE_SIGNATURES = {
  ".png": [[[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]]],
  ".jpg": [[[0, [0xff, 0xd8, 0xff]]]],
  ".jpeg": [[[0, [0xff, 0xd8, 0xff]]]],
  ".gif": [[[0, [0x47, 0x49, 0x46, 0x38]]]],
  ".webp": [[[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]]],
  ".ico": [[[0, [0x00, 0x00, 0x01, 0x00]]]],
};
// The directory lets a license, a readme, and .gitignore through by name, as
// UTF-8 text. Named files with an extension follow the extension rules.
const EXEMPT_TEXT_BASENAMES = /^(LICENSE|LICENCE|COPYING|README)$|^\.gitignore$/;
const UTF8_BOM = [0xef, 0xbb, 0xbf];
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

function matchesAt(buffer, offset, bytes) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function matchesSignature(buffer, signature) {
  return signature.every(([offset, bytes]) => matchesAt(buffer, offset, bytes));
}

function checkFile(relativePath, content) {
  const base = path.posix.basename(relativePath);
  const ext = path.posix.extname(base).toLowerCase();
  const problems = [];

  const start = matchesAt(content, 0, UTF8_BOM) ? UTF8_BOM.length : 0;
  if (content[start] === 0x23 && content[start + 1] === 0x21) problems.push("starts with #!");
  if (PACKAGE_MANAGER_FILES.has(base)) problems.push("is a package manager configuration file");

  if (IMAGE_SIGNATURES[ext]) {
    if (!IMAGE_SIGNATURES[ext].some((signature) => matchesSignature(content, signature))) {
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

// Read the staged blobs, not the working tree: that is what a commit ships (in
// CI the index equals HEAD), symlinks are seen as symlinks instead of being
// followed, and files deleted on disk but still tracked are still checked.
function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024, ...options });
}

const entries = git(["ls-files", "-s", "-z", "--", pluginDir], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .map((record) => {
    const tab = record.indexOf("\t");
    const [mode, sha] = record.slice(0, tab).split(" ");
    return { mode, sha, file: record.slice(tab + 1) };
  });

if (entries.length === 0) {
  console.error(`${pluginDir} has no tracked files`);
  process.exit(1);
}

const errors = [];
for (const { mode, sha, file } of entries) {
  if (mode !== "100644" && mode !== "100755") {
    errors.push(`${file}: is not a regular file (git mode ${mode}); symlinks and submodules are not shipped as content`);
    continue;
  }
  const relativePath = file.slice(pluginDir.length + 1);
  for (const problem of checkFile(relativePath, git(["cat-file", "blob", sha]))) {
    errors.push(`${file}: ${problem}`);
  }
}

if (errors.length > 0) {
  console.error("Claude Code plugin ships files the plugin directory refuses from unverified publishers:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Claude Code plugin file allowlist check passed (${entries.length} files).`);
