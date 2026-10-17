import test from "node:test";
import assert from "node:assert/strict";

import { StoriesFly, type ApiResult, type Profile, type UserPostsPage, type UsersPage } from "../src/index.js";

/**
 * Nothing here runs. `tsc` checks it when the tests are built: every call below
 * must compile as written, and every `@ts-expect-error` line must fail to compile.
 */
async function typeChecks(client: StoriesFly, signal: AbortSignal): Promise<void> {
  // user
  const profile: Profile = await client.user.profile({ username: "instagram" });
  await client.user.profile({ id: "25025320" });
  await client.user.about({ username: "instagram" });
  const posts: UserPostsPage = await client.user.posts({ username: "instagram", cursor: "c1.x" });
  await client.user.reels({ id: "25025320" });
  await client.user.tagged({ username: "instagram" });
  await client.user.pinned({ username: "instagram" });
  await client.user.stories({ username: "instagram" });
  await client.user.highlights({ username: "instagram" });
  const followers: UsersPage = await client.user.followers({ username: "instagram" });
  await client.user.following({ username: "instagram", cursor: undefined });
  await client.user.followersSearch({ username: "instagram", q: "an" });
  await client.user.followingSearch({ id: "25025320", q: "an" });
  await client.user.reposts({ username: "instagram" });
  await client.user.suggested({ username: "instagram" });

  // post
  await client.post.get({ url: "https://www.instagram.com/p/DcyLOLIEdy7/" });
  await client.post.get({ code: "DcyLOLIEdy7" });
  await client.post.get({ id: "3977290773452414139" });
  await client.post.comments({ code: "DcyLOLIEdy7", cursor: "c1.x" });
  await client.post.commentReplies({ code: "DcyLOLIEdy7", comment_id: "17880553506623292" });
  await client.post.likers({ code: "DcyLOLIEdy7" });
  await client.post.usertags({ id: "3977290773452414139" });
  await client.post.music({ url: "https://www.instagram.com/reel/DaDPoGWPqpZ/" });

  // comment, story, highlight
  await client.comment.likers({ comment_id: "17880553506623292" });
  await client.story.get({ url: "https://www.instagram.com/stories/instagram/3987461624755717505/" });
  await client.story.get({ id: "3987461624755717505" });
  await client.highlight.get({ id: "18103599704256781" });

  // hashtag, location, search, track, resolve, shop, account
  await client.hashtag.get({ name: "coffee" });
  await client.hashtag.posts({ name: "coffee", sort: "reels", cursor: "c1.x" });
  await client.location.get({ id: "106256377723342" });
  await client.location.posts({ id: "106256377723342", sort: "recent" });
  await client.location.search({ q: "coffee" });
  await client.location.search({ lat: 40.75, lng: -73.97 });
  await client.search.users({ q: "coffee" });
  await client.search.hashtags({ q: "coffee" });
  await client.search.places({ q: "coffee" });
  await client.search.music({ q: "coffee" });
  await client.search.reels({ q: "coffee" });
  await client.search.top({ q: "coffee" });
  await client.track.get({ id: "1234567890" });
  await client.shop.storefront({ username: "gymshark" });
  await client.shop.products({ collection_id: "curated-1-2", cursor: "c1.x" });
  const resolved = await client.resolve({ url: "https://www.instagram.com/s/abc" });
  if (resolved.type === "story") resolved.story.media_url;
  if (resolved.type === "post") resolved.likes;
  const account = await client.account();
  account.balance_usd.toFixed(2);

  // the body types carry the fields of the API
  profile.followers;
  posts.posts[0]?.media[0]?.video_url;
  followers.users[0]?.is_private;
  followers.next_cursor;

  // options
  await client.user.profile({ username: "instagram" }, { signal, timeoutMs: 1000, maxRetries: 0 });

  // withMeta changes the type of the result
  const withMeta: ApiResult<Profile> = await client.user.profile({ username: "instagram" }, { withMeta: true });
  withMeta.meta.unitsCharged;
  withMeta.data.username;
  const accountMeta = await client.account({ withMeta: true });
  accountMeta.meta.requestId;

  // paginate
  for await (const page of client.paginate(client.user.followers, { username: "instagram" }, { maxPages: 2 })) {
    page.users[0]?.username;
  }
  for await (const result of client.paginate(client.post.comments, { code: "x" }, { withMeta: true })) {
    result.meta.unitsCharged;
    result.data.comments[0]?.text;
  }

  // ---- calls that must not compile ----

  // @ts-expect-error: username and id together
  await client.user.profile({ username: "instagram", id: "25025320" });
  // @ts-expect-error: neither
  await client.user.profile({});
  // @ts-expect-error: no parameters
  await client.user.profile();
  // @ts-expect-error: a post by url and code together
  await client.post.get({ url: "https://www.instagram.com/p/x/", code: "x" });
  // @ts-expect-error: a cursor on a call that has none
  await client.user.profile({ username: "instagram", cursor: "c1.x" });
  // @ts-expect-error: a sort the endpoint does not know
  await client.hashtag.posts({ name: "coffee", sort: "bogus" });
  // @ts-expect-error: the places of a point need both lat and lng
  await client.location.search({ lat: 1 });
  // @ts-expect-error: q is required
  await client.search.users({});
  // @ts-expect-error: comment_id is required
  await client.post.commentReplies({ code: "x" });
  // @ts-expect-error: ids are strings, because Instagram's pass 2^53
  await client.user.profile({ id: 25025320 });
  // @ts-expect-error: profile is not a list, so it cannot be paginated
  client.paginate(client.user.profile, { username: "instagram" });
  // @ts-expect-error: followersSearch does not take a cursor
  client.paginate(client.user.followersSearch, { username: "instagram", q: "an" });
  // @ts-expect-error: the account call takes no parameters
  await client.account({ username: "instagram" });
}

test("the types accept every call of the client and refuse the wrong ones", () => {
  // The work is done by the compiler. This keeps the function in use.
  assert.equal(typeof typeChecks, "function");
});

test("the client has a StoriesFly default export too", async () => {
  const mod = await import("../src/index.js");
  assert.equal(mod.default, StoriesFly);
});
