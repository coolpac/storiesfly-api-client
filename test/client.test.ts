import test from "node:test";
import assert from "node:assert/strict";

import { StoriesFly, StoriesFlyError, buildQuery, type FetchLike } from "../src/index.js";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

interface StubResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Raw body, for the non-JSON responses (binary downloads, plain-text errors). */
  raw?: string | Uint8Array;
}

/** A `fetch` stub that records every call and replays queued responses. */
function stubFetch(...results: StubResult[]): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const queue = [...results];

  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    const next = queue.length > 1 ? queue.shift()! : (queue[0] ?? {});
    const status = next.status ?? 200;
    const headers = { ...(next.headers ?? {}) };

    if (next.raw !== undefined) {
      return new Response(next.raw, { status, headers });
    }
    if (next.body === undefined) {
      return new Response(null, { status, headers });
    }
    return new Response(JSON.stringify(next.body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };

  return { fetch, calls };
}

const client = (fetch: FetchLike, extra?: { baseUrl?: string; bearerToken?: string }) =>
  new StoriesFly({ apiKey: "sf_live_test_key", fetch, ...extra });

/* -------------------------------------------------------------------------- */
/* Construction                                                                */
/* -------------------------------------------------------------------------- */

test("constructor requires an API key", () => {
  assert.throws(
    () => new StoriesFly({ apiKey: "" }),
    (err: unknown) => err instanceof TypeError && /apiKey/.test((err as Error).message)
  );
});

test("baseUrl defaults to storiesfly.com and trailing slashes are trimmed", async () => {
  const { fetch, calls } = stubFetch({ body: { username: "a" } });
  assert.equal(client(fetch).baseUrl, "https://storiesfly.com");

  const custom = client(fetch, { baseUrl: "http://localhost:3000///" });
  assert.equal(custom.baseUrl, "http://localhost:3000");
  await custom.getProfile("a");
  assert.equal(calls[0]?.url, "http://localhost:3000/api/profile?username=a");
});

/* -------------------------------------------------------------------------- */
/* Happy paths                                                                 */
/* -------------------------------------------------------------------------- */

test("getStories posts the username and returns the parsed body", async () => {
  const payload = {
    profile: {
      id: "25025320",
      username: "instagram",
      fullName: "Instagram",
      profilePicUrl: "https://cdninstagram.com/pic.jpg",
      posts: 7503,
      followers: 680000000,
      following: 75,
      isPrivate: false,
    },
    stories: [
      {
        id: "story_1",
        mediaType: "image",
        source: "https://cdninstagram.com/s1.jpg",
        takenAt: "2026-03-04T10:30:00Z",
      },
    ],
    highlights: [{ id: "highlight:1", title: "Trips", coverUrl: "https://cdninstagram.com/c.jpg" }],
    fromCache: false,
  };
  const { fetch, calls } = stubFetch({ body: payload });

  const result = await client(fetch).getStories("instagram");

  assert.deepEqual(result, payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "https://storiesfly.com/api/stories");
  assert.equal(calls[0]?.body, '{"username":"instagram"}');
  assert.equal(calls[0]?.headers["Content-Type"], "application/json");
});

test("getProfile returns the handler's field set", async () => {
  const payload = {
    username: "instagram",
    fullName: "Instagram",
    profilePicUrl: null,
    posts: 7503,
    followers: 680000000,
    following: 75,
    isPrivate: false,
  };
  const { fetch } = stubFetch({ body: payload });

  const profile = await client(fetch).getProfile("instagram");

  assert.equal(profile.followers, 680000000);
  assert.equal(profile.profilePicUrl, null);
});

test("getMedia accepts a bare URL or an explicit shortcode", async () => {
  const { fetch, calls } = stubFetch({ body: { media: [] } });
  const sf = client(fetch);

  await sf.getMedia("https://www.instagram.com/p/ABC123/");
  await sf.getMedia({ shortcode: "ABC123" });

  assert.equal(calls[0]?.body, '{"url":"https://www.instagram.com/p/ABC123/"}');
  assert.equal(calls[1]?.body, '{"shortcode":"ABC123"}');
});

test("addTrackedAccount posts igUsername and returns the created row", async () => {
  const row = {
    id: "clv1abc23def45ghi67jkl89",
    userId: "clv0user00000000000000000",
    igUsername: "instagram",
    igUserId: "25025320",
    initialFollowers: 680000000,
    initialFollowing: 75,
    storyOnly: false,
    trackLikes: false,
    trackFollows: true,
    trackFollowers: true,
    trackStories: true,
    notifyNewStory: true,
    syncStatus: "PENDING",
    syncRetries: 0,
    lastPolledAt: null,
    lastDiffAt: null,
    lastStoryPolledAt: null,
    createdAt: "2026-03-04T12:00:00.000Z",
  };
  const { fetch, calls } = stubFetch({ body: row });

  const account = await client(fetch).addTrackedAccount("instagram");

  assert.equal(account.syncStatus, "PENDING");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.body, '{"igUsername":"instagram"}');
});

test("removeTrackedAccount sends DELETE with the id as a query parameter", async () => {
  const { fetch, calls } = stubFetch({ body: { success: true } });

  const result = await client(fetch).removeTrackedAccount("clv1abc23def45ghi67jkl89");

  assert.equal(result.success, true);
  assert.equal(calls[0]?.method, "DELETE");
  assert.equal(
    calls[0]?.url,
    "https://storiesfly.com/api/tracker/accounts?accountId=clv1abc23def45ghi67jkl89"
  );
  assert.equal(calls[0]?.body, undefined);
});

test("download returns bytes, content type and the proxy filename", async () => {
  const { fetch, calls } = stubFetch({
    raw: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": 'attachment; filename="storiesfly_1717000000000.jpg"',
    },
  });

  const file = await client(fetch).download("https://cdninstagram.com/media.jpg?x=1");

  assert.equal(file.contentType, "image/jpeg");
  assert.equal(file.filename, "storiesfly_1717000000000.jpg");
  assert.deepEqual(Array.from(file.data), [0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(
    calls[0]?.url,
    "https://storiesfly.com/api/download?url=https%3A%2F%2Fcdninstagram.com%2Fmedia.jpg%3Fx%3D1"
  );
});

/* -------------------------------------------------------------------------- */
/* Auth headers                                                                */
/* -------------------------------------------------------------------------- */

test("every request carries the API key in X-Api-Key", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const sf = client(fetch);

  await sf.getProfile("instagram");
  await sf.getStories("instagram");
  await sf.listTrackedAccounts();
  await sf.download("https://cdninstagram.com/a.jpg").catch(() => undefined);

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.headers["X-Api-Key"], "sf_live_test_key");
  }
});

test("no Content-Type is sent on requests without a body", async () => {
  const { fetch, calls } = stubFetch({ body: {} });

  await client(fetch).getProfile("instagram");

  assert.equal(calls[0]?.headers["Content-Type"], undefined);
});

test("the bearer token is sent only to the outbound-analytics endpoint", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const sf = client(fetch, { bearerToken: "jwt.token.value" });

  await sf.getProfile("instagram");
  await sf.getOutboundEngagement("instagram");

  assert.equal(calls[0]?.headers["Authorization"], undefined);
  assert.equal(calls[1]?.headers["Authorization"], "Bearer jwt.token.value");
  // The key still rides along; the handler simply ignores it.
  assert.equal(calls[1]?.headers["X-Api-Key"], "sf_live_test_key");
});

/* -------------------------------------------------------------------------- */
/* Query-string building                                                       */
/* -------------------------------------------------------------------------- */

test("buildQuery drops undefined and null, and encodes values", () => {
  assert.equal(buildQuery({}), "");
  assert.equal(buildQuery({ a: undefined, b: null }), "");
  assert.equal(buildQuery({ page: 1, limit: 50 }), "?page=1&limit=50");
  assert.equal(buildQuery({ username: "a b&c" }), "?username=a+b%26c");
  assert.equal(buildQuery({ days: 0, flag: false }), "?days=0&flag=false");
});

test("optional params are omitted from the URL when not supplied", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const sf = client(fetch);

  // getOutboundEngagement refuses to send without a session JWT, so this one
  // case needs a client that carries one.
  const withJwt = client(fetch, { bearerToken: "jwt_test" });

  await sf.getTrackerEvents();
  await sf.getTrackerEvents({ page: 2 });
  await sf.getTrackerEvents({ page: 2, limit: 50 });
  await withJwt.getOutboundEngagement("example");
  await withJwt.getOutboundEngagement("example", { days: 7 });
  await sf.checkShadowban("example");
  await sf.checkShadowban("example", { locale: "tr" });

  assert.deepEqual(
    calls.map((c) => c.url.replace("https://storiesfly.com", "")),
    [
      "/api/tracker",
      "/api/tracker?page=2",
      "/api/tracker?page=2&limit=50",
      "/api/analytics/outbound?username=example",
      "/api/analytics/outbound?username=example&days=7",
      "/api/analytics/shadowban?username=example",
      "/api/analytics/shadowban?username=example&locale=tr",
    ]
  );
});

test("getHighlights passes the reel id through untouched", async () => {
  const { fetch, calls } = stubFetch({ body: { items: [] } });

  await client(fetch).getHighlights("highlight:17912345678901234");

  assert.equal(
    calls[0]?.url,
    "https://storiesfly.com/api/highlights?id=highlight%3A17912345678901234"
  );
});

/* -------------------------------------------------------------------------- */
/* Error mapping                                                               */
/* -------------------------------------------------------------------------- */

test("a non-2xx JSON response becomes a StoriesFlyError carrying status and body", async () => {
  const { fetch } = stubFetch({ status: 401, body: { error: "Invalid or revoked API key" } });

  const err = await client(fetch)
    .getProfile("instagram")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.name, "StoriesFlyError");
  assert.equal(err.status, 401);
  assert.deepEqual(err.body, { error: "Invalid or revoked API key" });
  assert.equal(err.method, "GET");
  assert.equal(err.url, "https://storiesfly.com/api/profile?username=instagram");
  assert.match(err.message, /401: Invalid or revoked API key/);
  assert.equal(err.isRateLimited, false);
  assert.equal(err.requiresUpgrade, false);
});

test("429 surfaces the rate-limit headers the handler sets", async () => {
  const { fetch } = stubFetch({
    status: 429,
    body: {
      error: "Daily limit reached. Upgrade for unlimited access.",
      upgrade: true,
      limit: 500,
      used: 500,
      retryAfterSec: 3600,
    },
    headers: {
      "retry-after": "3600",
      "x-ratelimit-limit": "500",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-used": "500",
    },
  });

  const err = await client(fetch)
    .getStories("instagram")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.status, 429);
  assert.equal(err.isRateLimited, true);
  assert.equal(err.requiresUpgrade, true);
  assert.deepEqual(err.rateLimit, { limit: 500, remaining: 0, used: 500, retryAfterSec: 3600 });
  assert.equal(err.retryAfterSec, 3600);
});

test("429 without headers still reports retryAfterSec from the body", async () => {
  const { fetch } = stubFetch({
    status: 429,
    body: { error: "Rate limit exceeded. Sign in for more access.", retryAfterSec: 3600 },
  });

  const err = await client(fetch)
    .getStories("instagram")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.deepEqual(err.rateLimit, { retryAfterSec: 3600 });
  assert.equal(err.retryAfterSec, 3600);
});

test("429 with no retry hint at all leaves retryAfterSec undefined", async () => {
  const { fetch } = stubFetch({
    status: 429,
    body: { error: "Daily analysis limit reached. Upgrade for more." },
  });

  const err = await client(fetch)
    .checkShadowban("example")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.deepEqual(err.rateLimit, {});
  assert.equal(err.retryAfterSec, undefined);
});

test("a non-JSON error body is kept as text", async () => {
  const { fetch } = stubFetch({
    status: 502,
    raw: "Bad Gateway",
    headers: { "content-type": "text/plain" },
  });

  const err = await client(fetch)
    .download("https://cdninstagram.com/a.jpg")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.status, 502);
  assert.equal(err.body, "Bad Gateway");
  assert.match(err.message, /502: Bad Gateway/);
});

test("an empty error body leaves body null and the message generic", async () => {
  const { fetch } = stubFetch({ status: 403 });

  const err = await client(fetch)
    .listTrackedAccounts()
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof StoriesFlyError);
  assert.equal(err.body, null);
  assert.equal(err.message, "StoriesFly API 403");
});

test("StoriesFlyError is a real Error subclass", async () => {
  const { fetch } = stubFetch({ status: 404, body: { error: "Not found" } });

  const err = await client(fetch)
    .getProfile("nope")
    .then(
      () => null,
      (e: unknown) => e
    );

  assert.ok(err instanceof Error);
  assert.ok(err instanceof StoriesFlyError);
  assert.ok(typeof (err as Error).stack === "string");
});

/* -------------------------------------------------------------------------- */
/* Bearer-only endpoint                                                        */
/* -------------------------------------------------------------------------- */

test("getOutboundEngagement fails locally when no session JWT is configured", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const sf = client(fetch);

  // The handler resolves auth with a Bearer-only helper, so an API key comes
  // back as a bare 401 the caller cannot diagnose. Fail before the request.
  assert.throws(
    () => sf.getOutboundEngagement("example"),
    (err: unknown) =>
      err instanceof StoriesFlyError &&
      err.status === 0 &&
      /bearerToken/.test(JSON.stringify(err.body))
  );
  assert.equal(calls.length, 0, "no request should leave the client");
});

test("getOutboundEngagement sends Authorization when a session JWT is configured", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  const sf = client(fetch, { bearerToken: "jwt_test" });

  await sf.getOutboundEngagement("example");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.headers["Authorization"], "Bearer jwt_test");
  assert.equal(calls[0]?.headers["X-Api-Key"], "sf_live_test_key");
});
