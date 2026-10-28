import test from "node:test";
import assert from "node:assert/strict";

import { ENDPOINTS, type TikTokUsersPage } from "../src/index.js";
import { makeClient, stubFetch } from "./helpers.js";

const lastUrl = (calls: { url: string }[]) => new URL(calls[calls.length - 1]!.url);

test("tiktok.video sends the url", async () => {
  const { fetch, calls } = stubFetch({ body: { id: "1" } });
  await makeClient(fetch).tiktok.video({ url: "https://vm.tiktok.com/abc/" });
  const u = lastUrl(calls);
  assert.equal(u.pathname, "/api/v1/tiktok/video");
  assert.equal(u.searchParams.get("url"), "https://vm.tiktok.com/abc/");
});

test("each tiktok.user method calls its path with the username", async () => {
  const names = ["profile", "videos", "stories", "followers", "following", "reposts"] as const;
  for (const name of names) {
    const { fetch, calls } = stubFetch({ body: {} });
    await makeClient(fetch).tiktok.user[name]({ username: "khaby.lame" });
    const u = lastUrl(calls);
    assert.equal(u.pathname, `/api/v1/tiktok/user/${name}`, name);
    assert.deepEqual([...u.searchParams.keys()], ["username"], name);
    assert.equal(u.searchParams.get("username"), "khaby.lame");
  }
});

test("the paged TikTok methods are marked paged, the others are not", () => {
  const paged = ENDPOINTS.filter((e) => e.method.startsWith("tiktok.") && e.paged).map((e) => e.method);
  assert.deepEqual(paged, ["tiktok.user.videos", "tiktok.user.followers", "tiktok.user.following", "tiktok.user.reposts"]);
});

test("tiktok.user.followers sends the cursor", async () => {
  const { fetch, calls } = stubFetch({ body: {} });
  await makeClient(fetch).tiktok.user.followers({ username: "a", cursor: "c1.x" });
  assert.equal(lastUrl(calls).searchParams.get("cursor"), "c1.x");
});

test("paginate follows TikTok followers by cursor", async () => {
  const body = (ids: string[], next: string | null) => ({
    user: { username: "a" },
    users: ids.map((id) => ({ id })),
    next_cursor: next,
    has_more: next !== null,
    hidden: false,
  });
  const { fetch, calls } = stubFetch({ body: body(["1"], "c1.p2") }, { body: body(["2"], null) });
  const client = makeClient(fetch);
  const seen: string[] = [];
  const pages: TikTokUsersPage[] = [];
  for await (const p of client.paginate(client.tiktok.user.followers, { username: "a" })) {
    pages.push(p);
    for (const u of p.users) seen.push(u.id as string);
  }
  assert.equal(pages.length, 2);
  assert.deepEqual(seen, ["1", "2"]);
  assert.deepEqual(calls.map((c) => new URL(c.url).searchParams.get("cursor")), [null, "c1.p2"]);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/tiktok/user/followers");
});

test("download sends the url and costs one request", async () => {
  const { fetch, calls } = stubFetch({ body: { platform: "tiktok", media: [] } });
  const result = await makeClient(fetch).download({ url: "https://www.instagram.com/reel/DdY3MUJCfby/" });
  assert.equal(result.platform, "tiktok");
  const u = lastUrl(calls);
  assert.equal(u.pathname, "/api/v1/download");
  assert.equal(u.searchParams.get("url"), "https://www.instagram.com/reel/DdY3MUJCfby/");
  assert.equal(calls[0]!.init.method ?? "GET", "GET");
});
