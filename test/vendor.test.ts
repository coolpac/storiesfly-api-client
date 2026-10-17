import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The package never names the sources behind the API. The names are written in
// pieces so that this file does not hold them either.
const NAMES = ["hik" + "er", "insta" + "grapi", "lama" + "dava"];
const VENDOR = new RegExp(NAMES.join("|"), "i");

const root = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = new Set(["node_modules", ".git", "test-build"]);

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function hits(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (VENDOR.test(text)) found.push(relative(root, file));
  }
  return found;
}

test("the built dist names no source of the data", () => {
  const dist = join(root, "dist");
  assert.ok(existsSync(dist), "dist/ is missing: run `npm run build` before the tests");
  const files = walk(dist);
  // The scan must have something to scan: code, types and source maps.
  assert.ok(files.some((f) => f.endsWith("client.js")));
  assert.ok(files.some((f) => f.endsWith(".d.ts")));
  assert.ok(files.some((f) => f.endsWith(".js.map")));
  assert.deepEqual(hits(files), []);
});

test("the README names no source of the data", () => {
  assert.deepEqual(hits([join(root, "README.md")]), []);
});

test("nothing else in the package names one: the changelog, the spec, the examples, the code and the scripts", () => {
  const everything = walk(root).filter((f) => !f.endsWith("package-lock.json") && !f.includes(`${join(root, "dist")}`));
  assert.ok(everything.length > 20);
  assert.deepEqual(hits(everything), []);
});
