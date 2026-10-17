import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { API_ERROR_CODES, DEFAULT_BASE_URL, ENDPOINTS, VERSION } from "../src/index.js";
import { makeClient, methodOf, stubFetch } from "./helpers.js";

const root = (file: string) => fileURLToPath(new URL(`../../${file}`, import.meta.url));
const readText = (file: string) => readFileSync(root(file), "utf8");

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
}
interface Operation {
  operationId: string;
  parameters: Parameter[];
  "x-units": number | string;
  "x-page-size"?: number;
  responses: Record<string, { content?: { "application/json": { example?: unknown } }; $ref?: string }>;
}
interface Spec {
  openapi: string;
  servers: { url: string }[];
  security: Record<string, string[]>[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: Record<string, { type: string; in: string; name: string }>;
    responses: Record<string, { content: { "application/json": { schema: { properties: { code: { enum: string[] } } } } } }>;
  };
}

const spec = JSON.parse(readText("openapi.json")) as Spec;
const specPaths = Object.keys(spec.paths);
const get = (path: string): Operation => {
  const op = spec.paths[path]?.["get"];
  if (!op) throw new Error(`no GET ${path} in the spec`);
  return op;
};

/* -------------------------------------------------------------------------- */
/* Method table against the spec                                               */
/* -------------------------------------------------------------------------- */

test("the spec is OpenAPI 3.1 with 39 paths: 38 data endpoints and account", () => {
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(specPaths.length, 39);
  assert.ok(specPaths.includes("/account"));
});

test("every path of the spec has one method, and every method has a path of the spec", () => {
  const tablePaths = ENDPOINTS.map((e) => e.path);
  assert.deepEqual([...tablePaths].sort(), [...specPaths].sort());
  assert.equal(new Set(tablePaths).size, tablePaths.length, "a path is listed twice");
});

test("method names are unique", () => {
  const names = ENDPOINTS.map((e) => e.method);
  assert.equal(new Set(names).size, names.length);
});

test("every method of the table is a function on the client", () => {
  const client = makeClient(stubFetch({}).fetch);
  for (const e of ENDPOINTS) {
    assert.equal(typeof methodOf(client, e.method), "function", e.method);
  }
});

test("the client has no call that is not in the table", () => {
  const client = makeClient(stubFetch({}).fetch) as unknown as Record<string, unknown>;
  const listed = new Set(ENDPOINTS.map((e) => e.method));
  const found: string[] = [];
  for (const [name, value] of Object.entries(client)) {
    if (typeof value === "function") found.push(name);
    else if (value !== null && typeof value === "object") {
      for (const [inner, fn] of Object.entries(value)) if (typeof fn === "function") found.push(`${name}.${inner}`);
    }
  }
  // `paginate` is a method of the class, not an own property, so it is not in `found`.
  for (const name of found) assert.ok(listed.has(name as never), `${name} is on the client but not in the table`);
});

test("every operation is a GET that takes the key in X-Api-Key", () => {
  for (const [path, item] of Object.entries(spec.paths)) {
    assert.deepEqual(Object.keys(item), ["get"], path);
  }
  assert.deepEqual(spec.components.securitySchemes["ApiKey"], { type: "apiKey", in: "header", name: "X-Api-Key" });
  assert.deepEqual(spec.security, [{ ApiKey: [] }]);
});

test("the default base URL is the server of the spec", () => {
  assert.equal(spec.servers[0]?.url, DEFAULT_BASE_URL);
});

test("a method is marked paged exactly when the spec gives its endpoint a cursor parameter", () => {
  for (const e of ENDPOINTS) {
    const hasCursor = get(e.path).parameters.some((p) => p.name === "cursor");
    assert.equal(e.paged, hasCursor, e.method);
  }
});

test("every parameter of the spec is a query parameter", () => {
  for (const path of specPaths) {
    for (const p of get(path).parameters) assert.equal(p.in, "query", `${path} ${p.name}`);
  }
});

test("each method calls its path with the parameters of the spec, and no others", async () => {
  for (const e of ENDPOINTS) {
    const names = get(e.path).parameters.map((p) => p.name);
    const params = Object.fromEntries(names.map((n) => [n, `value of ${n}`]));

    const { fetch, calls } = stubFetch({ body: {} });
    const client = makeClient(fetch);
    const call = methodOf(client, e.method);
    // `account` takes no parameters; every other method takes the object.
    await (names.length === 0 ? call() : call(params));

    assert.equal(calls.length, 1, e.method);
    const url = new URL(calls[0]!.url);
    assert.equal(url.origin + url.pathname, `https://storiesfly.com/api/v1${e.path}`, e.method);
    assert.deepEqual([...url.searchParams.keys()].sort(), [...names].sort(), e.method);
    for (const n of names) assert.equal(url.searchParams.get(n), `value of ${n}`, `${e.method} ${n}`);
  }
});

test("every 200 example of the spec comes back from its method unchanged, with the meta of the headers", async () => {
  for (const e of ENDPOINTS) {
    const ok = get(e.path).responses["200"];
    const example = ok?.content?.["application/json"].example;
    assert.ok(example !== undefined, `${e.path} has no 200 example`);

    const { fetch } = stubFetch({ body: example, headers: { "x-units-charged": "1", "x-request-id": "req_spec" } });
    const call = methodOf(makeClient(fetch), e.method);
    const names = get(e.path).parameters.map((p) => p.name);
    const result = (await (names.length === 0 ? call({ withMeta: true }) : call(Object.fromEntries(names.map((n) => [n, "x"])), { withMeta: true }))) as {
      data: unknown;
      meta: { requestId: string };
    };
    assert.deepEqual(result.data, example, e.method);
    assert.equal(result.meta.requestId, "req_spec");
  }
});

test("the units of the spec: 1 for a data call, 0 for account, and the share-link note on resolve", () => {
  for (const e of ENDPOINTS) {
    const units = get(e.path)["x-units"];
    if (e.method === "account") assert.equal(units, 0);
    else if (e.method === "resolve") assert.equal(units, "1, or 2 for share links");
    else assert.equal(units, 1, e.method);
  }
});

test("every error code of the spec is one the client knows", () => {
  const known = new Set<string>(API_ERROR_CODES);
  const inSpec = new Set<string>();
  for (const response of Object.values(spec.components.responses)) {
    for (const code of response.content["application/json"].schema.properties.code.enum) inSpec.add(code);
  }
  assert.ok(inSpec.size >= 10);
  for (const code of inSpec) assert.ok(known.has(code), `${code} is in the spec but not in API_ERROR_CODES`);
});

/* -------------------------------------------------------------------------- */
/* README and package                                                          */
/* -------------------------------------------------------------------------- */

test("the method table of the README is what the spec and the client's table give", async () => {
  const script = new URL("../../scripts/readme-table.mjs", import.meta.url).href;
  const generator = (await import(script)) as {
    renderTable(spec: unknown, endpoints: readonly unknown[]): string;
    withTable(readme: string, table: string): string;
  };
  const readme = readText("README.md");
  const expected = generator.withTable(readme, generator.renderTable(spec, ENDPOINTS));
  assert.equal(readme, expected, "README.md method table is out of date: run `npm run readme:sync`");
});

test("the README table has a row for every path of the spec, with its units", () => {
  const readme = readText("README.md");
  for (const path of specPaths) {
    const units = String(get(path)["x-units"]);
    assert.ok(readme.includes(`| \`GET ${path}\` | ${units} |`), `README.md has no row for ${path} with ${units} units`);
  }
});

test("the version in the code is the version in package.json", () => {
  const pkg = JSON.parse(readText("package.json")) as { version: string };
  assert.equal(VERSION, pkg.version);
  assert.equal(pkg.version, "1.0.0");
});

test("the changelog has an entry for this version", () => {
  assert.match(readText("CHANGELOG.md"), new RegExp(`^## \\[?${VERSION.replaceAll(".", "\\.")}\\]?`, "m"));
});
