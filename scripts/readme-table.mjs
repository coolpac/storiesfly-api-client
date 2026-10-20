#!/usr/bin/env node
// Writes the method table of the README from openapi.json and the method table of
// the client (dist/endpoints.js), so the README never lists a unit price or a path
// the spec does not.
//
//   node scripts/readme-table.mjs sync    rewrite the table in README.md
//   node scripts/readme-table.mjs check   fail when the README table is not what sync would write
//
// Run `npm run build` first: the client's table is read from dist/.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const START = "<!-- methods:start -->";
export const END = "<!-- methods:end -->";

const root = new URL("../", import.meta.url);
const specPath = fileURLToPath(new URL("openapi.json", root));
const readmePath = fileURLToPath(new URL("README.md", root));
const endpointsUrl = new URL("dist/endpoints.js", root).href;

/** The Paged cell: "yes", with the page size when the spec gives one (`x-page-size`). */
function paged(endpoint, operation) {
  if (!endpoint.paged) return "";
  const size = operation["x-page-size"];
  return size === undefined ? "yes" : `yes, up to ${size}`;
}

/** The table, as Markdown, in the order of the client's method table. */
export function renderTable(spec, endpoints) {
  const rows = endpoints.map((e) => {
    const op = spec.paths[e.path]?.get;
    if (!op) throw new Error(`the spec has no GET ${e.path} (method ${e.method})`);
    const units = String(op["x-units"]);
    return `| \`client.${e.method}()\` | \`GET ${e.path}\` | ${units} | ${paged(e, op)} | ${op.summary} |`;
  });
  return ["| Call | Endpoint | Units | Paged | Returns |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

/** README text with the table between the markers replaced. */
export function withTable(readme, table) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md must hold ${START} and ${END}, in that order`);
  }
  return `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`;
}

async function current() {
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const { ENDPOINTS } = await import(endpointsUrl);
  return { spec, table: renderTable(spec, ENDPOINTS) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  const { table } = await current();
  const readme = await readFile(readmePath, "utf8");
  const next = withTable(readme, table);
  if (command === "sync") {
    await writeFile(readmePath, next);
    console.log("README.md method table written");
  } else if (command === "check") {
    if (next !== readme) {
      console.error("The method table in README.md is out of date. Run `npm run readme:sync`.");
      process.exit(1);
    }
    console.log("README.md method table is current");
  } else {
    console.error("usage: node scripts/readme-table.mjs sync|check");
    process.exit(2);
  }
}
