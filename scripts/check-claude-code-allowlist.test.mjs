import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WAVEfmt ")]);

// Builds a throwaway repo holding the checker and a plugins/claude-code tree,
// stages every file, and runs the checker against the staged blobs.
function withFixture(files, fn) {
  const root = mkdtempSync(path.join(tmpdir(), "volcano-allowlist-test-"));
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, stdio: "pipe" });
  const put = (relative, content) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  try {
    put("scripts/check-claude-code-allowlist.mjs", readFileSync(new URL("./check-claude-code-allowlist.mjs", import.meta.url)));
    for (const [relative, content] of Object.entries(files)) put(`plugins/claude-code/${relative}`, content);
    git("init", "--quiet");
    const plugin = (relative) => path.join(root, "plugins/claude-code", relative);
    const check = () => spawnSync(process.execPath, [path.join(root, "scripts/check-claude-code-allowlist.mjs")], { cwd: root, encoding: "utf8" });
    const stage = () => git("add", "-A");
    const run = () => {
      stage();
      return check();
    };
    return fn({ run, check, stage, plugin });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const allowed = {
  ".claude-plugin/plugin.json": "{}\n",
  "LICENSE": "license text\n",
  "README.md": "# readme\n",
  ".gitignore": "node_modules\n",
  "skills/a/SKILL.md": "---\nname: a\n---\n",
  "skills/index.json": "{}\n",
  "skills/a/config.yaml": "a: 1\n",
  "notes.txt": "plain\n",
  "assets/icon.png": PNG,
  "assets/icon.webp": WEBP,
};

test("passes a plugin made only of allowed files", () => {
  withFixture(allowed, ({ run }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /passed \(10 files\)/);
  });
});

test("reports each refused file with its reason", () => {
  const refused = {
    "skills/scripts/check.mjs": "#!/usr/bin/env node\n",
    "assets/icon.svg": "<svg/>",
    "skills/run.md": "#!/bin/sh\necho\n",
    "skills/bom.md": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("#!/bin/sh\n")]),
    "assets/fake.png": "not a png",
    "assets/sound.webp": WAV,
    "README.sh": "echo hi\n",
    "pnpm-workspace.yaml": "packages: []\n",
    "skills/nul.md": Buffer.from("a\0b"),
    "skills/latin1.txt": Buffer.from([0xff, 0xfe]),
  };
  withFixture({ ...allowed, ...refused }, ({ run }) => {
    const result = run();
    assert.equal(result.status, 1);
    const expected = [
      ["skills/scripts/check.mjs", /starts with #!/],
      ["skills/scripts/check.mjs", /type \.mjs is not/],
      ["assets/icon.svg", /type \.svg is not/],
      ["skills/run.md", /starts with #!/],
      ["skills/bom.md", /starts with #!/],
      ["assets/fake.png", /content is not a PNG image/],
      ["assets/sound.webp", /content is not a WEBP image/],
      ["README.sh", /type \.sh is not/],
      ["pnpm-workspace.yaml", /package manager configuration/],
      ["skills/nul.md", /NUL byte/],
      ["skills/latin1.txt", /not valid UTF-8/],
    ];
    for (const [file, reason] of expected) {
      const line = result.stderr.split("\n").find((l) => l.includes(`plugins/claude-code/${file}:`) && reason.test(l));
      assert.ok(line, `expected ${file} to be reported as ${reason}\n${result.stderr}`);
    }
    for (const file of Object.keys(allowed)) {
      assert.ok(!result.stderr.includes(`plugins/claude-code/${file}:`), `${file} should not be reported`);
    }
  });
});

test("reports a tracked symlink instead of following it", () => {
  withFixture(allowed, ({ run, plugin }) => {
    symlinkSync("../README.md", plugin("skills/link.md"));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /skills\/link\.md: is not a regular file \(git mode 120000\)/);
  });
});

test("checks staged content, not the working tree", () => {
  withFixture(allowed, ({ run, check, stage, plugin }) => {
    // A refused file that is staged but fixed only on disk still fails.
    writeFileSync(plugin("skills/staged.md"), "#!/bin/sh\n");
    assert.equal(run().status, 1);
    writeFileSync(plugin("skills/staged.md"), "fixed on disk only\n");
    assert.equal(check().status, 1, "an unstaged fix must not hide the staged content");

    // A staged file deleted on disk is still read from git, without crashing.
    stage();
    unlinkSync(plugin("assets/icon.webp"));
    const deleted = check();
    assert.equal(deleted.status, 0, deleted.stderr);
  });
});
