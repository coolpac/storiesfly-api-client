import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MediaItem, Post } from "../src/index.js";
import { makeClient, stubFetch } from "./helpers.js";

interface Spec {
  paths: Record<string, { get: { responses: Record<string, { content?: { "application/json": { example?: unknown } } }> } }>;
}

const spec = JSON.parse(readFileSync(fileURLToPath(new URL("../../openapi.json", import.meta.url)), "utf8")) as Spec;

/** The 200 example of `GET /post` in the spec: a carousel of two pictures. */
const specPost = spec.paths["/post"]!.get.responses["200"]!.content!["application/json"].example as Post;

test("the spec example of GET /post is a carousel with media links", () => {
  assert.equal(specPost.media_type, "carousel");
  assert.ok(specPost.media.length >= 2);
  assert.ok(specPost.media[0]!.image_url);
});

test("post.get returns media[0].image_url or video_url from the spec example", async () => {
  const { fetch, calls } = stubFetch({ body: specPost });
  const post = await makeClient(fetch).post.get({ code: specPost.shortcode });

  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/post");
  assert.equal(new URL(calls[0]!.url).searchParams.get("code"), specPost.shortcode);

  const first = post.media[0];
  assert.ok(first, "the answer has no media");
  const link = first.video_url ?? first.image_url;
  assert.ok(link !== null && link.startsWith("https://"), "media[0] has neither image_url nor video_url");
  assert.equal(first.image_url, specPost.media[0]!.image_url);
  assert.equal(first.video_url, specPost.media[0]!.video_url);
  assert.equal(post.media.length, specPost.media.length);
});

test("post.get returns the whole post of the spec example, not only the numbers", async () => {
  const { fetch } = stubFetch({ body: specPost });
  const post = await makeClient(fetch).post.get({ url: specPost.url });

  assert.deepEqual(post, specPost);
  assert.equal(post.caption, specPost.caption);
  assert.deepEqual(post.owner, specPost.owner);
  assert.equal(post.pinned, true);
  assert.equal(post.thumbnail_url, specPost.thumbnail_url);
  assert.equal(post.likes, specPost.likes);
  assert.equal(post.shares, null);
});

test("post.get returns video_url for a video slide", async () => {
  // The spec example is a carousel of pictures; this is the same post with its media replaced by one video.
  const video: MediaItem = {
    id: "3977286630464928057",
    type: "video",
    image_url: "https://scontent-lax3-2.cdninstagram.com/v/t51.82787-15/cover.jpg",
    video_url: "https://scontent-lax3-2.cdninstagram.com/o1/v/t2/f2/m86/clip.mp4",
    width: 1080,
    height: 1920,
    video_duration: 12.5,
  };
  const reel: Post = { ...specPost, media_type: "reel", media: [video], video_duration: 12.5, views: 4200 };
  const { fetch } = stubFetch({ body: reel });
  const post = await makeClient(fetch).post.get({ id: reel.id });

  assert.equal(post.media.length, 1);
  assert.equal(post.media[0]?.video_url, video.video_url);
  assert.equal(post.media[0]?.image_url, video.image_url);
  assert.equal(post.video_duration, 12.5);
});

test("post.get with withMeta keeps the whole post in data", async () => {
  const { fetch } = stubFetch({ body: specPost, headers: { "x-units-charged": "1", "x-request-id": "req_post" } });
  const { data, meta } = await makeClient(fetch).post.get({ code: specPost.shortcode }, { withMeta: true });

  assert.equal(data.media[0]?.image_url, specPost.media[0]!.image_url);
  assert.equal(meta.unitsCharged, 1);
  assert.equal(meta.requestId, "req_post");
});

test("resolve for a post link returns the whole post, with type: post", async () => {
  const { fetch, calls } = stubFetch({ body: { type: "post", ...specPost }, headers: { "x-units-charged": "1" } });
  const resolved = await makeClient(fetch).resolve({ url: specPost.url });

  assert.equal(new URL(calls[0]!.url).pathname, "/api/v1/resolve");
  assert.equal(resolved.type, "post");
  if (resolved.type !== "post") return assert.fail("resolve did not return a post");

  // Narrowed by `type`: the fields of a whole post, not only its numbers.
  const first = resolved.media[0];
  assert.ok(first);
  assert.equal(first.image_url, specPost.media[0]!.image_url);
  assert.equal(resolved.caption, specPost.caption);
  assert.equal(resolved.shortcode, specPost.shortcode);
  assert.deepEqual(resolved.owner, specPost.owner);
});
