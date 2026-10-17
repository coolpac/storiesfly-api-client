import test from "node:test";
import assert from "node:assert/strict";

import { StoriesFlyError, type UsersPage } from "../src/index.js";
import { makeClient, page, stubFetch } from "./helpers.js";

const cursorsOf = (urls: string[]) => urls.map((u) => new URL(u).searchParams.get("cursor"));

test("paginate follows next_cursor until has_more is false", async () => {
  const { fetch, calls } = stubFetch(
    { body: page(["1", "2"], "c1.p2") },
    { body: page(["3", "4"], "c1.p3") },
    { body: page(["5"], null) },
  );
  const client = makeClient(fetch);

  const seen: string[] = [];
  let pages = 0;
  for await (const p of client.paginate(client.user.followers, { username: "instagram" })) {
    pages++;
    for (const u of (p as unknown as { users: { id: string }[] }).users) seen.push(u.id);
  }

  assert.equal(pages, 3);
  assert.deepEqual(seen, ["1", "2", "3", "4", "5"]);
  assert.equal(calls.length, 3);
  assert.deepEqual(cursorsOf(calls.map((c) => c.url)), [null, "c1.p2", "c1.p3"]);
  // Every other parameter stays the same from page to page.
  for (const c of calls) assert.equal(new URL(c.url).searchParams.get("username"), "instagram");
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/user/followers");
});

test("paginate stops when has_more is false, even if next_cursor is set", async () => {
  const { fetch, calls } = stubFetch({ body: { users: [], next_cursor: "c1.more", has_more: false } });
  const client = makeClient(fetch);
  const pages: UsersPage[] = [];
  for await (const p of client.paginate(client.user.followers, { username: "a" })) pages.push(p);
  assert.equal(pages.length, 1);
  assert.equal(calls.length, 1);
});

test("paginate stops when there is no next_cursor, even if has_more is true", async () => {
  const { fetch, calls } = stubFetch({ body: { users: [], next_cursor: null, has_more: true } });
  const client = makeClient(fetch);
  let pages = 0;
  for await (const _p of client.paginate(client.user.followers, { username: "a" })) pages++;
  assert.equal(pages, 1);
  assert.equal(calls.length, 1);
});

test("paginate stops after maxPages", async () => {
  const { fetch, calls } = stubFetch({ body: page(["1"], "c1.same") }, { body: page(["2"], "c1.b") }, { body: page(["3"], "c1.c") }, { body: page(["4"], "c1.d") });
  const client = makeClient(fetch);
  let pages = 0;
  for await (const _p of client.paginate(client.user.followers, { username: "a" }, { maxPages: 2 })) pages++;
  assert.equal(pages, 2);
  assert.equal(calls.length, 2);
});

test("maxPages must be a whole number, 1 or more", async () => {
  const { fetch, calls } = stubFetch({ body: page([], null) });
  const client = makeClient(fetch);
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(async () => {
      for await (const _p of client.paginate(client.user.followers, { username: "a" }, { maxPages: bad })) {
        // not reached
      }
    }, TypeError);
  }
  assert.equal(calls.length, 0);
});

test("breaking out of the loop stops the calls", async () => {
  const { fetch, calls } = stubFetch({ body: page(["1"], "c1.p2") }, { body: page(["2"], "c1.p3") }, { body: page(["3"], null) });
  const client = makeClient(fetch);
  for await (const _p of client.paginate(client.user.followers, { username: "a" })) break;
  assert.equal(calls.length, 1);
});

test("a cursor in params starts the walk from that page", async () => {
  const { fetch, calls } = stubFetch({ body: page(["9"], "c1.next") }, { body: page(["10"], null) });
  const client = makeClient(fetch);
  let pages = 0;
  for await (const _p of client.paginate(client.user.followers, { username: "a", cursor: "c1.start" })) pages++;
  assert.equal(pages, 2);
  assert.deepEqual(cursorsOf(calls.map((c) => c.url)), ["c1.start", "c1.next"]);
});

test("a list that points back at a page already read ends the walk", async () => {
  const { fetch, calls } = stubFetch({ body: page(["1"], "c1.p2") }, { body: page(["2"], "c1.p2") }, { body: page(["3"], "c1.p2") });
  const client = makeClient(fetch);
  let pages = 0;
  for await (const _p of client.paginate(client.user.followers, { username: "a" })) pages++;
  assert.equal(pages, 2);
  assert.equal(calls.length, 2);
});

test("an error on a later page is thrown after the pages before it were yielded", async () => {
  const { fetch } = stubFetch(
    { body: page(["1"], "c1.p2") },
    { status: 402, body: { error: "No credits left. Top up your API balance to continue.", code: "credits_exhausted" } },
  );
  const client = makeClient(fetch);
  const got: string[] = [];
  await assert.rejects(
    (async () => {
      for await (const p of client.paginate(client.user.followers, { username: "a" })) got.push(p.next_cursor ?? "end");
    })(),
    (err: unknown) => err instanceof StoriesFlyError && err.code === "credits_exhausted",
  );
  assert.deepEqual(got, ["c1.p2"]);
});

test("withMeta: true yields { data, meta } for each page", async () => {
  const { fetch } = stubFetch(
    { body: page(["1"], "c1.p2"), headers: { "x-units-charged": "1", "x-balance-remaining": "9.0000" } },
    { body: page(["2"], null), headers: { "x-units-charged": "1", "x-balance-remaining": "8.9985" } },
  );
  const client = makeClient(fetch);
  const balances: (string | null)[] = [];
  for await (const r of client.paginate(client.user.following, { id: "7719696" }, { withMeta: true })) {
    assert.equal(r.meta.unitsCharged, 1);
    balances.push(r.meta.balanceRemaining);
  }
  assert.deepEqual(balances, ["9.0000", "8.9985"]);
});

test("paginate works with every paged method and sends its own path", async () => {
  const { fetch, calls } = stubFetch({ body: { next_cursor: null, has_more: false } });
  const client = makeClient(fetch);

  const walks: [AsyncGenerator<unknown>, string][] = [
    [client.paginate(client.user.posts, { username: "a" }), "/api/v1/user/posts"],
    [client.paginate(client.post.comments, { code: "DcyLOLIEdy7" }), "/api/v1/post/comments"],
    [client.paginate(client.hashtag.posts, { name: "coffee", sort: "recent" }), "/api/v1/hashtag/posts"],
    [client.paginate(client.search.users, { q: "coffee" }), "/api/v1/search/users"],
    [client.paginate(client.shop.products, { collection_id: "curated-1-2" }), "/api/v1/shop/products"],
  ];
  for (const [walk, path] of walks) {
    for await (const _p of walk) {
      // one page
    }
    assert.equal(new URL(calls.at(-1)!.url).pathname, path);
  }
});

test("a paginated walk retries a rate limit on a page and goes on", async () => {
  const { fetch, calls } = stubFetch(
    { body: page(["1"], "c1.p2") },
    { status: 429, body: { error: "Too many requests. Slow down and retry.", code: "rate_limited" }, headers: { "retry-after": "0" } },
    { body: page(["2"], null) },
  );
  const client = makeClient(fetch);
  let pages = 0;
  for await (const _p of client.paginate(client.user.followers, { username: "a" })) pages++;
  assert.equal(pages, 2);
  assert.equal(calls.length, 3);
});
