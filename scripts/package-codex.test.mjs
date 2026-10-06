import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("public ZIP uses committed files only and rejects committed symlinks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "volcano-package-test-"));
  const source = path.join(root, "plugins/codex");
  const put = (relative, content) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Packaging Test", "-c", "user.email=packaging@example.invalid", ...args], { cwd: root, stdio: "pipe" });
  try {
    put("scripts/package-codex.mjs", readFileSync(new URL("./package-codex.mjs", import.meta.url)));
    const manifest = {
      name: "volcano", version: "1.2.3", description: "Test package", skills: "./skills/",
      interface: { displayName: "Volcano" }, review: { commerce: false }, publication: { countries: [] },
    };
    put("plugins/codex/.codex-plugin/plugin.json", JSON.stringify(manifest));
    put("plugins/codex/skills/example/SKILL.md", "reviewed skill");
    put("plugins/codex/skills/scripts/check-skills.mjs", "// Catalog validation stub: this fixture tests archive boundaries.\n");
    put("plugins/codex/assets/icon.svg", "<svg/>");
    put("plugins/codex/LICENSE", "reviewed license");
    put("plugins/codex/README.md", "reviewed readme");
    put(".gitignore", ".env\n");
    git("init", "--quiet");
    git("add", ".");
    git("commit", "--quiet", "-m", "fixture");

    const sentinel = "UNTRACKED_PRIVATE_SENTINEL";
    put("plugins/codex/skills/.env", sentinel); // ignored local secret
    put("plugins/codex/assets/local.txt", sentinel); // ordinary untracked file
    put("plugins/codex/assets/staged.txt", sentinel); // staged but not committed
    git("add", "plugins/codex/assets/staged.txt");
    put("plugins/codex/README.md", sentinel); // dirty tracked file
    put("plugins/codex/.codex-plugin/plugin.json", "invalid local manifest");
    symlinkSync(path.join(source, "skills/.env"), path.join(source, "skills/local-link"));
    const script = path.join(root, "scripts/package-codex.mjs");
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
    for (const [args, version] of [[[], "1.2.3"], [["--version", "1.2.5"], "1.2.5"]]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      const archive = path.join(root, "dist", `volcano-${version}-public.zip`);
      const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).split("\n");
      for (const excluded of ["skills/.env", "skills/local-link", "assets/local.txt", "assets/staged.txt"]) assert.ok(!names.includes(excluded), excluded);
      assert.ok(!execFileSync("unzip", ["-p", archive], { maxBuffer: 1024 * 1024 }).includes(Buffer.from(sentinel)));
      const read = (file) => execFileSync("unzip", ["-p", archive, file], { encoding: "utf8" });
      assert.equal(read("README.md"), "reviewed readme");
      const portable = JSON.parse(read("plugin.json"));
      const native = JSON.parse(read(".codex-plugin/plugin.json"));
      assert.equal(portable.version, version);
      assert.equal(native.version, version);
      for (const field of ["interface", "publication", "review"]) assert.deepEqual(portable.extensions["com.openai"][field], native[field]);
      execFileSync("unzip", ["-t", archive], { stdio: "pipe" });
    }
    assert.notEqual(run("--version", "../invalid").status, 0);
    // Even a committed symlink must never cause packaging to dereference a local file.
    git("add", "plugins/codex/skills/local-link");
    git("commit", "--quiet", "-m", "symlink fixture");
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /requires regular committed files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
