import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";

import { buildQuery } from "../src/client.js";
import { StoriesFly, StoriesFlyError, type ApiErrorCode } from "../src/index.js";
import { makeClient, stubFetch, type Reply } from "./helpers.js";

/* -------------------------------------------------------------------------- */
/* Construction                                                                */
/* -------------------------------------------------------------------------- */

test("the constructor requires an API key", () => {
  assert.throws(() => new StoriesFly({ apiKey: "" }), (err: unknown) => err instanceof TypeError && /apiKey/.test((err as Error).message));
  assert.throws(() => new StoriesFly({ apiKey: "   " }), TypeError);
  assert.throws(() => new StoriesFly(undefined as never), TypeError);
});

test("timeoutMs and maxRetries are checked", () => {
  const { fetch } = stubFetch({});
  assert.throws(() => new StoriesFly({ apiKey: "k", fetch, timeoutMs: -1 }), TypeError);
  assert.throws(() => new StoriesFly({ apiKey: "k", fetch, timeoutMs: Number.NaN }), TypeError);
  assert.throws(() => new StoriesFly({ apiKey: "k", fetch, maxRetries: 1.5 }), TypeError);
  assert.throws(() => new StoriesFly({ apiKey: "k", fetch, maxRetries: -1 }), TypeError);
  assert.doesNotThrow(() => new StoriesFly({ apiKey: "k", fetch, timeoutMs: 0, maxRetries: 0 }));
});

test("baseUrl defaults to the v1 API and trailing slashes are trimmed", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  assert.equal(makeClient(fetch).baseUrl, "https://storiesfly.com/api/v1");

  const local = makeClient(fetch, { baseUrl: "http://localhost:3000/api/v1///" });
  assert.equal(local.baseUrl, "http://localhost:3000/api/v1");
  await local.user.profile({ username: "a" });
  assert.equal(calls[0]?.url, "http://localhost:3000/api/v1/user/profile?username=a");
});

test("the API key is not on the client where a log or JSON.stringify would show it", () => {
  const { fetch } = stubFetch({});
  const client = new StoriesFly({ apiKey: "sf_secret_value", fetch });
  assert.ok(!JSON.stringify(client).includes("sf_secret_value"));
  assert.ok(!inspect(client, { depth: 5, showHidden: true }).includes("sf_secret_value"));
});

test("the global fetch is used when none is given", () => {
  assert.doesNotThrow(() => new StoriesFly({ apiKey: "k" }));
});

/* -------------------------------------------------------------------------- */
/* What is sent                                                                */
/* -------------------------------------------------------------------------- */

test("a call is a GET with the key in X-Api-Key and no body", async () => {
  const { fetch, calls } = stubFetch({ body: { user: { id: "1", username: "instagram" }, stories: [] } });
  const client = new StoriesFly({ apiKey: "  sf_test_key\n", fetch });

  await client.user.stories({ username: "instagram" });

  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.url, "https://storiesfly.com/api/v1/user/stories?username=instagram");
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.headers["X-Api-Key"], "sf_test_key");
  assert.equal(call.init.headers["Accept"], "application/json");
  assert.match(call.init.headers["User-Agent"] ?? "", /^storiesfly-js\/\d+\.\d+\.\d+$/);
  assert.ok(!("body" in call.init));
  assert.ok(!("Authorization" in call.init.headers));
  assert.ok(call.init.signal instanceof AbortSignal);
});

test("the key never appears in the URL", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  await makeClient(fetch).user.profile({ id: "7719696" });
  assert.ok(!calls[0]!.url.includes("sf_test_key"));
});

/* -------------------------------------------------------------------------- */
/* Query encoding                                                              */
/* -------------------------------------------------------------------------- */

test("buildQuery leaves out undefined and null, and returns '' when nothing is left", () => {
  assert.equal(buildQuery(undefined), "");
  assert.equal(buildQuery({}), "");
  assert.equal(buildQuery({ a: undefined, b: null }), "");
  assert.equal(buildQuery({ a: "1", b: undefined, c: "3" }), "?a=1&c=3");
});

test("buildQuery percent-encodes values, with %20 for a space", () => {
  assert.equal(buildQuery({ q: "coffee shop" }), "?q=coffee%20shop");
  assert.equal(buildQuery({ q: "c++" }), "?q=c%2B%2B");
  assert.equal(buildQuery({ q: "a&b=c#d" }), "?q=a%26b%3Dc%23d");
  assert.equal(buildQuery({ q: "кофе" }), "?q=%D0%BA%D0%BE%D1%84%D0%B5");
  assert.equal(buildQuery({ q: "☕" }), "?q=%E2%98%95");
  assert.equal(buildQuery({ username: "@instagram" }), "?username=%40instagram");
});

test("buildQuery turns numbers and booleans into text, and keeps the order of the keys", () => {
  assert.equal(buildQuery({ lat: 40.75267612, lng: -73.97777108 }), "?lat=40.75267612&lng=-73.97777108");
  assert.equal(buildQuery({ z: 1, a: true }), "?z=1&a=true");
  assert.equal(buildQuery({ n: 0 }), "?n=0");
});

test("buildQuery refuses a value that is not a string, number or boolean", () => {
  assert.throws(() => buildQuery({ q: { nested: 1 } }), (err: unknown) => err instanceof TypeError && /`q`/.test((err as Error).message));
  assert.throws(() => buildQuery({ q: ["a", "b"] }), TypeError);
});

test("a full URL and a cursor survive the trip into the query string", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const client = makeClient(fetch);

  await client.post.get({ url: "https://www.instagram.com/p/DcyLOLIEdy7/?igsh=abc&utm=1" });
  assert.equal(
    calls[0]!.url,
    "https://storiesfly.com/api/v1/post?url=https%3A%2F%2Fwww.instagram.com%2Fp%2FDcyLOLIEdy7%2F%3Figsh%3Dabc%26utm%3D1",
  );
  const sent = new URL(calls[0]!.url).searchParams.get("url");
  assert.equal(sent, "https://www.instagram.com/p/DcyLOLIEdy7/?igsh=abc&utm=1");

  const cursor = "c1.ryg6VkAgkE2BcPyGM0q6ADwLG1KAGWvXyxXcleap6rtdnm6USXXD4rRRujLUjticHxS2vixe2jbdlG4LggGvIE1ISp6sYLXI6XWcb66UIrM_RMPDKCUhQylnCgNoMsPrfzM";
  await client.user.posts({ username: "arianagrande", cursor });
  assert.equal(new URL(calls[1]!.url).searchParams.get("cursor"), cursor);
  assert.equal(new URL(calls[1]!.url).searchParams.get("username"), "arianagrande");
});

test("an undefined cursor is not sent", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  await makeClient(fetch).user.followers({ username: "instagram", cursor: undefined });
  assert.equal(calls[0]!.url, "https://storiesfly.com/api/v1/user/followers?username=instagram");
});

test("lat and lng may be numbers", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  await makeClient(fetch).location.search({ lat: 40.7527, lng: -73.9778 });
  assert.equal(calls[0]!.url, "https://storiesfly.com/api/v1/location/search?lat=40.7527&lng=-73.9778");
});

/* -------------------------------------------------------------------------- */
/* Response meta                                                               */
/* -------------------------------------------------------------------------- */

const BILLING_HEADERS = {
  "x-units-charged": "1",
  "x-balance-remaining": "9.2380",
  "x-free-units-remaining": "17",
  "x-ratelimit-limit": "3",
  "x-ratelimit-remaining": "2",
  "x-request-id": "req_123",
};

test("a call resolves to the body alone", async () => {
  const body = { id: "7719696", username: "arianagrande" };
  const { fetch } = stubFetch({ body, headers: BILLING_HEADERS });
  assert.deepEqual(await makeClient(fetch).user.profile({ username: "arianagrande" }), body);
});

test("withMeta: true resolves to { data, meta } with the billing headers", async () => {
  const body = { id: "7719696", username: "arianagrande" };
  const { fetch } = stubFetch({ body, headers: BILLING_HEADERS });
  const result = await makeClient(fetch).user.profile({ username: "arianagrande" }, { withMeta: true });

  assert.deepEqual(result.data, body);
  assert.deepEqual(result.meta, {
    status: 200,
    requestId: "req_123",
    unitsCharged: 1,
    balanceRemaining: "9.2380",
    freeUnitsRemaining: 17,
    rateLimitLimit: 3,
    rateLimitRemaining: 2,
  });
});

test("a header the answer lacks is null in meta", async () => {
  const { fetch } = stubFetch({ body: {} });
  const { meta } = await makeClient(fetch).user.profile({ username: "a" }, { withMeta: true });
  assert.deepEqual(meta, {
    status: 200,
    requestId: null,
    unitsCharged: null,
    balanceRemaining: null,
    freeUnitsRemaining: null,
    rateLimitLimit: null,
    rateLimitRemaining: null,
  });
});

test("the balance stays a string, so no float rounds it", async () => {
  const { fetch } = stubFetch({ body: {}, headers: { "x-balance-remaining": "0.1000" } });
  const { meta } = await makeClient(fetch).user.profile({ username: "a" }, { withMeta: true });
  assert.equal(meta.balanceRemaining, "0.1000");
});

test("account() takes no parameters, and takes options alone", async () => {
  const body = { tier: "START", unit_price_usd: 0.0015, balance_usd: 9.238, free_units: 0 };
  const { fetch, calls } = stubFetch({ body, headers: { ...BILLING_HEADERS, "x-units-charged": "0" } });
  const client = makeClient(fetch);

  assert.deepEqual(await client.account(), body);
  const withMeta = await client.account({ withMeta: true });
  assert.equal(withMeta.meta.unitsCharged, 0);
  assert.equal(calls[0]!.url, "https://storiesfly.com/api/v1/account");
  assert.equal(calls[1]!.url, "https://storiesfly.com/api/v1/account");
});

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

interface ErrorCase {
  status: number;
  code: ApiErrorCode;
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const ERROR_CASES: ErrorCase[] = [
  { status: 400, code: "bad_request", extra: { fields: ["username"] } },
  { status: 401, code: "unauthorized" },
  { status: 402, code: "credits_exhausted" },
  { status: 403, code: "telegram_required", extra: { link_url: "https://t.me/example_bot?start=link" } },
  { status: 403, code: "private_account", headers: { "x-units-charged": "1" } },
  { status: 404, code: "not_found", headers: { "x-units-charged": "1" } },
  { status: 404, code: "unknown_endpoint" },
  { status: 429, code: "rate_limited", headers: { "retry-after": "3" } },
  { status: 500, code: "internal_error" },
  { status: 503, code: "upstream_unavailable", headers: { "retry-after": "5" } },
];

for (const c of ERROR_CASES) {
  test(`${c.status} ${c.code} becomes a StoriesFlyError with that code`, async () => {
    const { fetch, calls } = stubFetch({
      status: c.status,
      body: { error: `sentence for ${c.code}`, code: c.code, ...c.extra },
      headers: { "x-request-id": "req_err", ...c.headers },
    });
    const err = await makeClient(fetch, { maxRetries: 0 })
      .user.profile({ username: "a" })
      .then(
        () => assert.fail("expected an error"),
        (e: unknown) => e,
      );

    assert.ok(err instanceof StoriesFlyError);
    assert.ok(err instanceof Error);
    assert.equal(err.name, "StoriesFlyError");
    assert.equal(err.status, c.status);
    assert.equal(err.code, c.code);
    assert.equal(err.requestId, "req_err");
    assert.equal(err.meta?.requestId, "req_err");
    assert.equal(err.url, "https://storiesfly.com/api/v1/user/profile?username=a");
    assert.ok(err.message.includes(c.code) && err.message.includes(`sentence for ${c.code}`) && err.message.includes(String(c.status)));
    assert.deepEqual(err.fields, c.extra?.fields ?? null);
    assert.equal(err.linkUrl, (c.extra?.link_url as string | undefined) ?? null);
    assert.equal(err.retryAfterMs, c.headers?.["retry-after"] ? Number(c.headers["retry-after"]) * 1000 : null);
    assert.equal(err.meta?.unitsCharged, c.headers?.["x-units-charged"] ? Number(c.headers["x-units-charged"]) : null);
    assert.equal(calls.length, 1);
  });
}

test("an error says whether it was charged, through meta.unitsCharged", async () => {
  const { fetch } = stubFetch({
    status: 404,
    body: { error: "Nothing was found for this request.", code: "not_found" },
    headers: { "x-units-charged": "1", "x-balance-remaining": "9.0000", "x-free-units-remaining": "0" },
  });
  const err = (await makeClient(fetch).user.profile({ username: "nobody" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(err.meta?.unitsCharged, 1);
  assert.equal(err.meta?.balanceRemaining, "9.0000");
});

test("an error body that is not JSON becomes invalid_response and keeps the status and the text", async () => {
  const { fetch } = stubFetch({ status: 502, text: "<html><body>Bad gateway</body></html>", headers: { "content-type": "text/html" } });
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.status, 502);
  assert.equal(err.code, "invalid_response");
  assert.equal(err.body, "<html><body>Bad gateway</body></html>");
  assert.match(err.message, /502/);
});

test("an error JSON without a known code becomes invalid_response and keeps the body", async () => {
  const { fetch } = stubFetch({ status: 418, body: { error: "teapot", code: "teapot" } });
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(err.code, "invalid_response");
  assert.equal(err.status, 418);
  assert.deepEqual(err.body, { error: "teapot", code: "teapot" });
});

test("a 200 that is not JSON becomes invalid_response", async () => {
  const { fetch } = stubFetch({ status: 200, text: "not json", headers: { "x-request-id": "req_x" } });
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(err.code, "invalid_response");
  assert.equal(err.status, 200);
  assert.equal(err.requestId, "req_x");
});

test("a failed fetch becomes network_error with the cause", async () => {
  const cause = new TypeError("fetch failed");
  const { fetch } = stubFetch({ fail: cause });
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.code, "network_error");
  assert.equal(err.status, 0);
  assert.equal(err.requestId, null);
  assert.equal(err.meta, null);
  assert.equal(err.cause, cause);
});

test("a call that takes longer than timeoutMs becomes timeout", async () => {
  const { fetch, calls } = stubFetch({ hang: true });
  const started = performance.now();
  const err = (await makeClient(fetch, { timeoutMs: 40 }).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.code, "timeout");
  assert.equal(err.status, 0);
  assert.ok(performance.now() - started < 1000);
  assert.equal(calls.length, 1);
});

test("timeoutMs can be set for one call, and 0 turns it off", async () => {
  const { fetch } = stubFetch({ hang: true });
  const err = (await makeClient(fetch, { timeoutMs: 60_000 }).user.profile({ username: "a" }, { timeoutMs: 30 }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(err.code, "timeout");

  const ok = stubFetch({ body: { ok: true } });
  assert.deepEqual(await makeClient(ok.fetch, { timeoutMs: 0 }).user.profile({ username: "a" }), { ok: true });
});

test("the caller's signal aborts the call with the caller's own reason", async () => {
  const { fetch } = stubFetch({ hang: true });
  const controller = new AbortController();
  const pending = makeClient(fetch).user.profile({ username: "a" }, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("stop")), 20);
  await assert.rejects(pending, (err: unknown) => !(err instanceof StoriesFlyError) && (err as Error).message === "stop");
});

test("a signal that is aborted already sends nothing", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(makeClient(fetch).user.profile({ username: "a" }, { signal: controller.signal }));
  assert.equal(calls.length, 0);
});

/* -------------------------------------------------------------------------- */
/* Retries                                                                     */
/* -------------------------------------------------------------------------- */

const LIMITED = (retryAfter: string | undefined): Reply => ({
  status: 429,
  body: { error: "Too many requests. Slow down and retry.", code: "rate_limited" },
  headers: retryAfter === undefined ? {} : { "retry-after": retryAfter },
});

test("a 429 waits for Retry-After, then tries again", async () => {
  const { fetch, calls } = stubFetch(LIMITED("1"), { body: { id: "1" } });
  const started = performance.now();
  const result = await makeClient(fetch).user.profile({ username: "a" });
  const elapsed = performance.now() - started;

  assert.deepEqual(result, { id: "1" });
  assert.equal(calls.length, 2);
  assert.ok(elapsed >= 950, `waited only ${elapsed} ms`);
  assert.ok(elapsed < 2500, `waited ${elapsed} ms`);
  // The second try is the same call.
  assert.equal(calls[1]!.url, calls[0]!.url);
  assert.deepEqual(calls[1]!.init.headers, calls[0]!.init.headers);
});

test("a 429 is retried up to maxRetries (2 by default), then thrown", async () => {
  const { fetch, calls } = stubFetch(LIMITED("0"));
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(calls.length, 3);
  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.code, "rate_limited");
  assert.equal(err.status, 429);
  assert.equal(err.retryAfterMs, 0);
});

test("maxRetries: 0 turns retries off, and a call can override the client", async () => {
  const off = stubFetch(LIMITED("0"));
  await assert.rejects(makeClient(off.fetch, { maxRetries: 0 }).user.profile({ username: "a" }), { code: "rate_limited" });
  assert.equal(off.calls.length, 1);

  const five = stubFetch(LIMITED("0"));
  await assert.rejects(makeClient(five.fetch, { maxRetries: 0 }).user.profile({ username: "a" }, { maxRetries: 4 }), { code: "rate_limited" });
  assert.equal(five.calls.length, 5);

  const none = stubFetch(LIMITED("0"));
  await assert.rejects(makeClient(none.fetch).user.profile({ username: "a" }, { maxRetries: 0 }), { code: "rate_limited" });
  assert.equal(none.calls.length, 1);
});

test("a 429 with no Retry-After still retries, after a short wait", async () => {
  const { fetch, calls } = stubFetch(LIMITED(undefined), { body: { id: "1" } });
  const started = performance.now();
  await makeClient(fetch).user.profile({ username: "a" });
  assert.equal(calls.length, 2);
  assert.ok(performance.now() - started >= 450);
});

test("a Retry-After that is an HTTP date is read", async () => {
  const soon = new Date(Date.now() + 1500).toUTCString();
  const { fetch } = stubFetch(LIMITED(soon));
  const err = (await makeClient(fetch, { maxRetries: 0 }).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.ok(err.retryAfterMs !== null && err.retryAfterMs > 0 && err.retryAfterMs <= 1500, String(err.retryAfterMs));
});

test("a Retry-After longer than the cap is not waited out: the call fails at once", async () => {
  const { fetch, calls } = stubFetch(LIMITED("3600"));
  const started = performance.now();
  const err = (await makeClient(fetch).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(calls.length, 1);
  assert.equal(err.code, "rate_limited");
  assert.equal(err.retryAfterMs, 3_600_000);
  assert.ok(performance.now() - started < 500);
});

test("402 credits_exhausted is never retried", async () => {
  const { fetch, calls } = stubFetch(
    { status: 402, body: { error: "No credits left. Top up your API balance to continue.", code: "credits_exhausted" }, headers: { "retry-after": "0" } },
    { body: { id: "1" } },
  );
  const err = (await makeClient(fetch, { maxRetries: 5 }).user.profile({ username: "a" }).catch((e: unknown) => e)) as StoriesFlyError;
  assert.equal(calls.length, 1);
  assert.equal(err.code, "credits_exhausted");
  assert.equal(err.status, 402);
});

test("only 429 is retried: 400, 401, 403, 404, 500 and 503 are thrown at the first answer", async () => {
  for (const status of [400, 401, 403, 404, 500, 503]) {
    const { fetch, calls } = stubFetch({ status, body: { error: "x", code: "internal_error" }, headers: { "retry-after": "0" } }, { body: {} });
    await assert.rejects(makeClient(fetch, { maxRetries: 3 }).user.profile({ username: "a" }), { status });
    assert.equal(calls.length, 1, `status ${status} was retried`);
  }
});

test("an abort during the wait before a retry stops the call", async () => {
  const { fetch, calls } = stubFetch(LIMITED("10"));
  const controller = new AbortController();
  const pending = makeClient(fetch).user.profile({ username: "a" }, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("enough")), 30);
  const started = performance.now();
  await assert.rejects(pending, (err: unknown) => (err as Error).message === "enough");
  assert.ok(performance.now() - started < 1000);
  assert.equal(calls.length, 1);
});

test("a retry after a 429 does not charge twice in the client's eyes: the final answer's meta is the 200's", async () => {
  const { fetch } = stubFetch(LIMITED("0"), { body: { id: "1" }, headers: { "x-units-charged": "1", "x-request-id": "req_ok" } });
  const { meta } = await makeClient(fetch).user.profile({ username: "a" }, { withMeta: true });
  assert.equal(meta.status, 200);
  assert.equal(meta.unitsCharged, 1);
  assert.equal(meta.requestId, "req_ok");
});
