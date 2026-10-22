import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const sourceScript = resolve(process.cwd(), "scripts/bump-version.mjs");
const temporaryRoots = [];

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixture(commitMessage, changedPath) {
  const root = mkdtempSync(join(tmpdir(), "jslynk-versioning-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(dirname(join(root, changedPath)), { recursive: true });
  writeFileSync(join(root, "scripts", "bump-version.mjs"), readFileSync(sourceScript, "utf8"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "versioning-fixture", version: "1.0.0" }, null, 2) + "\n");
  writeFileSync(join(root, "version-history.json"), JSON.stringify(
    [{ version: "1.0.0", date: "2026-01-01", title: "Initial", changes: ["Initial version established"] }], null, 2,
  ) + "\n");
  writeFileSync(join(root, "VERSION_HISTORY.md"), "# History\n");
  writeFileSync(join(root, changedPath), "initial content\n");
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Versioning Test");
  git(root, "config", "user.email", "versioning-test@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-m", "chore: initial fixture");
  const before = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, changedPath), "updated content\n");
  git(root, "add", changedPath);
  git(root, "commit", "-m", commitMessage);
  return { root, before, after: git(root, "rev-parse", "HEAD") };
}

function simulate(root, before, after) {
  return execFileSync("node", ["scripts/bump-version.mjs", "auto", "--before", before, "--after", after, "--dry-run"], {
    cwd: root, encoding: "utf8",
  });
}

test("detects root configuration changes and increments PATCH", () => {
  const { root, before, after } = fixture("chore(config): adjust build settings", "vite.config.ts");
  const output = simulate(root, before, after);
  assert.match(output, /"version": "1\.0\.1"/);
  assert.match(output, /Adjust build settings/);
});

test("increments MINOR for feat commits", () => {
  const { root, before, after } = fixture("feat(search): add note search", "src/search.js");
  const output = simulate(root, before, after);
  assert.match(output, /"version": "1\.1\.0"/);
  assert.match(output, /Add note search/);
});

test("increments MAJOR for breaking changes", () => {
  const { root, before, after } = fixture("feat(api)!: change account schema", "auth-config.js");
  const output = simulate(root, before, after);
  assert.match(output, /"version": "2\.0\.0"/);
  assert.match(output, /Change account schema/);
});

test("ignores generated history artifacts", () => {
  const { root, before } = fixture("chore: initial fixture", "version-history.json");
  writeFileSync(join(root, "version-history.json"), JSON.stringify(
    [{ version: "1.0.0", date: "2026-01-01", title: "Initial", changes: ["Initial version established"] }], null, 2,
  ) + "\n");
  git(root, "add", "version-history.json");
  git(root, "commit", "-m", "chore(version): update generated history [skip ci]");
  const after = git(root, "rev-parse", "HEAD");
  assert.match(simulate(root, before, after), /Nenhuma versão gerada/);
});

test.after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});
