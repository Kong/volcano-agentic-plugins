import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { catalogRootEntries, isOutsideCatalog } from "./skill-sync-contents.mjs";

const PLUGIN_SKILL_DIRS = ["plugins/cursor/skills", "plugins/claude-code/skills", "plugins/claude-desktop/skills", "plugins/codex/skills"];

function put(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
    })
    .sort();
}

function index(...names) {
  return JSON.stringify({ version: 1, skills: names.map((name) => ({ name, description: name, path: `/skills/${name}/SKILL.md` })) });
}

// A repo root holding the real sync and drift scripts and a fake
// sources/volcano-skills with catalog content plus skills-repo tooling.
function withFixture(fn) {
  const root = mkdtempSync(path.join(tmpdir(), "volcano-skill-sync-test-"));
  try {
    for (const script of ["sync-skills-from-source.mjs", "check-skill-drift.mjs", "skill-sync-contents.mjs"]) {
      put(root, `scripts/${script}`, readFileSync(new URL(`./${script}`, import.meta.url)));
    }
    const source = (relative, content) => put(root, `sources/volcano-skills/${relative}`, content);
    source("index.json", index("skill-a", "skill-b"));
    source("AGENTS.md", "agents\n");
    source("skill-a/SKILL.md", "a\n");
    source("skill-a/scripts/helper.md", "a skill's own scripts folder is content\n");
    source("skill-a/.DS_Store", "junk");
    source("skill-b/SKILL.md", "b\n");
    // Skills-repo tooling and anything not in the catalog.
    source("scripts/check-skills.mjs", "#!/usr/bin/env node\n");
    source("tests/cases.json", "{}\n");
    source(".github/workflows/ci.yml", "on: push\n");
    source("Makefile", "all:\n");
    source("tools/build.mjs", "export {};\n");
    source("unlisted-skill/SKILL.md", "not registered in index.json\n");
    const node = (script) => spawnSync(process.execPath, [path.join(root, "scripts", script)], { cwd: root, encoding: "utf8" });
    return fn({ root, node });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("sync copies only the catalog into every plugin", () => {
  withFixture(({ root, node }) => {
    const sync = node("sync-skills-from-source.mjs");
    assert.equal(sync.status, 0, sync.stderr);
    for (const dir of PLUGIN_SKILL_DIRS) {
      assert.deepEqual(listFiles(path.join(root, dir)), [
        "AGENTS.md",
        "index.json",
        "skill-a/SKILL.md",
        "skill-a/scripts/helper.md",
        "skill-b/SKILL.md",
      ], dir);
    }
    const drift = node("check-skill-drift.mjs");
    assert.equal(drift.status, 0, drift.stderr);
  });
});

test("drift check flags non-catalog files in a plugin copy", () => {
  withFixture(({ root, node }) => {
    assert.equal(node("sync-skills-from-source.mjs").status, 0);
    put(root, "plugins/codex/skills/scripts/check-skills.mjs", "#!/usr/bin/env node\n");
    put(root, "plugins/cursor/skills/.github/ci.yml", "on: push\n");
    const drift = node("check-skill-drift.mjs");
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /plugins\/codex\/skills has extra file scripts\/check-skills\.mjs/);
    assert.match(drift.stderr, /plugins\/cursor\/skills has extra file \.github\/ci\.yml/);
    assert.ok(!existsSync(path.join(root, "plugins/claude-code/skills/scripts")));
  });
});

test("catalogRootEntries rejects skill paths outside /skills/<name>/SKILL.md", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "volcano-skill-index-test-"));
  try {
    for (const bad of ["/skills/../escape/SKILL.md", "/skills/a/b/SKILL.md", "skills/a/SKILL.md", "/skills/.github/SKILL.md"]) {
      writeFileSync(path.join(dir, "index.json"), JSON.stringify({ skills: [{ name: "x", path: bad }] }));
      assert.throws(() => catalogRootEntries(dir), /must look like/, bad);
    }
    writeFileSync(path.join(dir, "index.json"), JSON.stringify({ version: 1 }));
    assert.throws(() => catalogRootEntries(dir), /skills array/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isOutsideCatalog keeps catalog entries and drops everything else", () => {
  const entries = new Set(["AGENTS.md", "index.json", "skill-a"]);
  for (const kept of ["AGENTS.md", "index.json", "skill-a", "skill-a/SKILL.md", "skill-a/scripts/x.md"]) {
    assert.equal(isOutsideCatalog(kept, entries), false, kept);
  }
  for (const dropped of ["scripts", "scripts/check-skills.mjs", "tests/x.json", "Makefile", ".github/ci.yml", "skill-a/.github/x", "skill-a/.DS_Store", "skill-b/SKILL.md"]) {
    assert.equal(isOutsideCatalog(dropped, entries), true, dropped);
  }
});
