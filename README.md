# storiesfly

[![CI](https://github.com/coolpac/storiesfly-api-client/actions/workflows/ci.yml/badge.svg)](https://github.com/coolpac/storiesfly-api-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/storiesfly.svg)](https://www.npmjs.com/package/storiesfly)

TypeScript client for the [StoriesFly API](https://storiesfly.com/developers). It reads public Instagram and TikTok data over HTTP. For Instagram: profiles, stories, highlights, posts, reels, comments, followers, hashtags, places and search. For TikTok: profiles, videos, stories, followers and following lists, reposts, and video download without the watermark. You do not log in to Instagram or TikTok and you do not handle cookies or sessions. You send an API key and pay per request. The same data works inside ChatGPT and Claude through the StoriesFly MCP server: see [Use it from ChatGPT and Claude (MCP)](#use-it-from-chatgpt-and-claude-mcp).

The package has no runtime dependencies. It needs Node 18 or newer (it uses the global `fetch`), it is ESM only, and it ships its own types. The 46 data calls and the free `account` call each have a method, and every answer is typed.

## Install

```sh
npm install storiesfly
```

## Get a key

1. Sign in with Telegram at <https://storiesfly.com/developers/dashboard>.
2. Create a key there. A new account gets 100 free requests, so you can try every call before you pay.

Keep the key on your server. Anyone who has it can spend your balance.

## Quick start

The stories an account has up right now:

```ts
import { StoriesFly } from "storiesfly";

const client = new StoriesFly({ apiKey: process.env.STORIESFLY_API_KEY! });

const { user, stories } = await client.user.stories({ username: "instagram" });

console.log(`${stories.length} stories up from account ${user.id}`);
for (const story of stories) {
  console.log(story.media_type, story.taken_at_iso, story.media_url);
}
```

Things to know:

- An account is named by `{ username }` or `{ id }`, never both. A post is named by `{ url }`, `{ code }` or `{ id }`. The types enforce this.
- Ids are strings. Instagram ids pass 2^53, and a JSON number would round them.
- Field names are `snake_case`, as the API sends them. A value the answer does not carry is `null`. It is never `0` or `""`.
- Media links in answers are signed Instagram CDN links. They expire within days, so download what you need soon.

A post, with the links to its pictures and video:

```ts
const post = await client.post.get({ url: "https://www.instagram.com/p/DcyLOLIEdy7/" });

console.log(post.caption, post.likes);
for (const item of post.media) {
  console.log(item.type, item.video_url ?? item.image_url); // one item per slide of a carousel
}
```

A TikTok video without the watermark, and a TikTok account's followers:

```ts
const video = await client.tiktok.video({ url: "https://www.tiktok.com/@khaby.lame/video/7697307919943060767" });
console.log(video.caption, video.views, video.video_url); // video_url has no watermark

const profile = await client.tiktok.user.profile({ username: "khaby.lame" });
console.log(profile.followers);

for await (const page of client.paginate(client.tiktok.user.followers, { username: "khaby.lame" }, { maxPages: 2 })) {
  for (const follower of page.users) console.log(follower.username);
}
```

### Options

```ts
new StoriesFly({
  apiKey: "...",       // required, sent as X-Api-Key
  baseUrl: "...",      // default https://storiesfly.com/api/v1
  fetch: myFetch,      // default: the global fetch
  timeoutMs: 60_000,   // per attempt; 0 turns the timeout off
  maxRetries: 2,       // for rate_limited answers; 0 turns retries off
});
```

Every call also takes a last argument with `signal` (an `AbortSignal`), `timeoutMs`, `maxRetries` and `withMeta`.

## Paging

A call that returns a list returns one page, with `next_cursor` and `has_more`. `client.paginate` follows the list for you. It is an async iterator that calls the method, yields the page, then calls it again with the `next_cursor` of the page before, until `has_more` is `false`:

```ts
for await (const page of client.paginate(client.user.followers, { username: "instagram" }, { maxPages: 4 })) {
  for (const follower of page.users) console.log(follower.username);
}
```

- Every page is one call and is charged as one. A large account has many pages, so set `maxPages` unless you mean to read the whole list.
- `paginate` takes the method itself (`client.user.followers`), its parameters, and options: `maxPages`, `signal` and `withMeta`. A `cursor` in the parameters starts the walk from a page you already have.
- Only methods that take `cursor` can be paginated, and the compiler refuses the rest. The `Paged` column of the [methods table](#methods) marks them, and `ENDPOINTS` (exported) has a `paged` flag on each.
- To page by hand, pass `next_cursor` back as `cursor` and keep every other parameter the same. A cursor is opaque. A cursor the API did not return gives `bad_request`.
- Page size follows Instagram and varies by endpoint. The spec fixes it for three: `user.posts` returns up to 9 items a page, `user.followers` and `user.following` up to 25. The `Paged` column of the [methods table](#methods) shows the size wherever the spec gives one.

## TikTok

TikTok calls live under `client.tiktok`. An account is named by `{ username }`.

```ts
await client.tiktok.video({ url });                          // one video or photo post, short links too
await client.tiktok.user.profile({ username });              // followers, following, likes, video count
await client.tiktok.user.videos({ username });               // newest first, paged
await client.tiktok.user.stories({ username });              // stories up now
await client.tiktok.user.followers({ username });            // paged
await client.tiktok.user.following({ username });            // paged
await client.tiktok.user.reposts({ username });              // paged
```

- `videos`, `followers`, `following` and `reposts` take `cursor` and return `next_cursor`, so `client.paginate` follows them. Page size follows TikTok and varies by endpoint.
- An account that hides its followers or following list answers an empty page with `hidden: true`.
- A number is `null` when it is not exact. File links are temporary: save the files right away.
- On a later page of `tiktok.user.videos`, `video_url` is `null`. To get the file of one video, call `tiktok.video` or `download` with its `url`.

## Download

`client.download({ url })` takes the link of an Instagram post, reel or IGTV, or of a TikTok video or photo post (short links too), and returns the file links: the video (TikTok's without the watermark), every picture of a carousel or photo post, the cover, and for TikTok the soundtrack. It returns files only; for the numbers use `post.get` or `tiktok.video`. The price is fixed per call: $0.50 per 1,000 for an Instagram link and $0.20 per 1,000 for a TikTok link.

```ts
const { platform, media } = await client.download({ url: "https://www.instagram.com/reel/DdY3MUJCfby/" });
for (const file of media) console.log(file.type, file.url);
```

File links are temporary, so download them right away. `client.account()` also shows the download prices as `download_price_usd`.

## Use it from ChatGPT and Claude (MCP)

The same data is available to AI assistants at `https://storiesfly.com/mcp`, with no code. Details: <https://storiesfly.com/developers/mcp>.

- In Claude Code: `claude mcp add --transport http storiesfly https://storiesfly.com/mcp`
- ChatGPT and Claude connect to the same address and sign in with Telegram.

## What a call cost: response meta

A call resolves to the parsed body. To see the billing headers too, pass `{ withMeta: true }` as the last argument and the call resolves to `{ data, meta }`:

```ts
const { data, meta } = await client.user.profile({ username: "instagram" }, { withMeta: true });

console.log(data.followers);
console.log(meta.unitsCharged, meta.balanceRemaining, meta.freeUnitsRemaining);
```

| `meta` field | Header | Meaning |
| --- | --- | --- |
| `status` | | The HTTP status. |
| `requestId` | `X-Request-Id` | The id of the call. Quote it when you write to support. |
| `unitsCharged` | `X-Units-Charged` | Units this call charged. 0 when it was free or was refunded. |
| `balanceRemaining` | `X-Balance-Remaining` | Your balance after the call, in US dollars with four decimals. A string, so no float rounds it. |
| `freeUnitsRemaining` | `X-Free-Units-Remaining` | Free units you have left. |
| `rateLimitLimit` | `X-RateLimit-Limit` | Requests per second your account may send. |
| `rateLimitRemaining` | `X-RateLimit-Remaining` | Requests left in the current second. |

A header the answer did not carry is `null`. The meta is returned per call and not kept on the client (there is no `lastResponse`), so calls that run at the same time cannot overwrite each other's numbers. With `paginate`, `{ withMeta: true }` yields `{ data, meta }` for each page.

## Errors and what is charged

Every call that does not return data throws `StoriesFlyError`. Test `code`, not `message`:

```ts
import { StoriesFly, StoriesFlyError } from "storiesfly";

try {
  await client.user.stories({ username: "some_private_account" });
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;

  console.log(err.status);       // HTTP status; 0 when no answer came
  console.log(err.code);         // "private_account"
  console.log(err.requestId);    // quote it to support
  console.log(err.retryAfterMs); // from Retry-After, when the API sent one
  console.log(err.meta?.unitsCharged); // what this failed call was charged
}
```

Other fields: `fields` (with `bad_request`, the names of the refused parameters), `linkUrl` (with `telegram_required`, the link that links your account to Telegram), `url` (the URL called; it holds no key) and `body` (the parsed error body).

You are charged for answers: a `200`, `not_found` and `private_account`. A wrong parameter, a rate limit and an empty balance cost nothing, and a failure on our side or at the data source is refunded. `err.meta.unitsCharged` and `X-Units-Charged` say what a call took.

| Status | `code` | Charged | When |
| --- | --- | --- | --- |
| 200 | | yes | The data. |
| 404 | `not_found` | yes | Nothing was found for this request. |
| 403 | `private_account` | yes | The call reached a private account. |
| 400 | `bad_request` | no | A parameter is missing or invalid. `fields` names it. |
| 401 | `unauthorized` | no | The key is missing or wrong. |
| 402 | `credits_exhausted` | no | No credits left. Top up your balance. |
| 403 | `telegram_required` | no | The account behind the key is not linked to Telegram. `linkUrl` has the link. |
| 404 | `unknown_endpoint` | no | No such endpoint. |
| 429 | `rate_limited` | no | Too many requests per second. |
| 500 | `internal_error` | refunded | A fault on our side. |
| 503 | `upstream_unavailable` | refunded | The data source is down for now. Try again shortly. |

The client adds three codes of its own, with `status` 0 when no answer came: `timeout` (no answer within `timeoutMs`), `network_error` (`fetch` failed; the error has the `cause`) and `invalid_response` (an answer that is not in the documented shape, such as a proxy's error page; the `status` and the body are kept).

### Retries

- A `429` is retried up to `maxRetries` times (2 by default). The client waits for the `Retry-After` the API sent, or half a second and then longer when it sent none. A `Retry-After` longer than 30 seconds is not waited out: the error is thrown at once, with `retryAfterMs` set.
- A `402` is never retried: another call would not change it.
- Other errors, timeouts and network errors are not retried. A `500` or `503` is refunded, so you can retry it yourself.

## Pricing

From $1.50 per 1,000 requests, prepaid. See <https://storiesfly.com/developers/pricing>.

One unit is one request. Every call takes 1 unit, a page of a list included. Resolving a share link takes 2, and `account` takes none. `download` is sold at a fixed price per call (see [Download](#download)) and uses one free unit when you have any. Free units are spent before your balance. Requests per second are limited per account.

## Methods

Each method is a call of API v1. This table is generated from the OpenAPI spec (`openapi.json`) and checked by the tests.

<!-- methods:start -->
| Call | Endpoint | Units | Paged | Returns |
| --- | --- | --- | --- | --- |
| `client.user.profile()` | `GET /user/profile` | 1 |  | Profile with verified badge, bio, link and counts |
| `client.user.about()` | `GET /user/about` | 1 |  | Country, join month and former usernames |
| `client.user.posts()` | `GET /user/posts` | 1 | yes, up to 9 | Posts with likes, comments, views, shares, saves and reposts |
| `client.user.reels()` | `GET /user/reels` | 1 | yes | Reels with captions, video and play counts |
| `client.user.tagged()` | `GET /user/tagged` | 1 | yes | Posts the account is tagged in |
| `client.user.pinned()` | `GET /user/pinned` | 1 |  | Posts pinned to the top of the profile |
| `client.user.stories()` | `GET /user/stories` | 1 |  | Stories live now, with the length of each video |
| `client.user.highlights()` | `GET /user/highlights` | 1 | yes | Highlight covers and titles |
| `client.user.followers()` | `GET /user/followers` | 1 | yes, up to 25 | Followers, page by page |
| `client.user.following()` | `GET /user/following` | 1 | yes, up to 25 | Accounts followed, page by page |
| `client.user.followersSearch()` | `GET /user/followers/search` | 1 |  | Find someone among the followers |
| `client.user.followingSearch()` | `GET /user/following/search` | 1 |  | Find someone among the accounts followed |
| `client.user.reposts()` | `GET /user/reposts` | 1 | yes | Posts and reels the account reposted |
| `client.user.suggested()` | `GET /user/suggested` | 1 |  | Similar accounts Instagram suggests |
| `client.post.get()` | `GET /post` | 1 |  | One post: media links, caption, views, likes, comments, shares, saves and reposts |
| `client.post.comments()` | `GET /post/comments` | 1 | yes | Comments with likes and reply counts |
| `client.post.commentReplies()` | `GET /post/comment-replies` | 1 | yes | Replies to a comment |
| `client.post.likers()` | `GET /post/likers` | 1 |  | Accounts that liked the post |
| `client.post.usertags()` | `GET /post/usertags` | 1 |  | People tagged in the post |
| `client.post.music()` | `GET /post/music` | 1 |  | The track used in a reel |
| `client.comment.likers()` | `GET /comment/likers` | 1 | yes | Accounts that liked a comment |
| `client.story.get()` | `GET /story` | 1 |  | One story by link or id |
| `client.highlight.get()` | `GET /highlight` | 1 |  | Every story in a highlight, by link or id |
| `client.hashtag.get()` | `GET /hashtag` | 1 |  | A hashtag with its post count |
| `client.hashtag.posts()` | `GET /hashtag/posts` | 1 | yes | Posts under a hashtag: top, recent or reels |
| `client.location.get()` | `GET /location` | 1 |  | Place name, address, city and coordinates |
| `client.location.posts()` | `GET /location/posts` | 1 | yes | Posts tagged at a place: top or recent |
| `client.location.search()` | `GET /location/search` | 1 |  | Find places by name or around a point |
| `client.search.users()` | `GET /search/users` | 1 | yes | Find accounts by name or username |
| `client.search.hashtags()` | `GET /search/hashtags` | 1 | yes | Find hashtags, with their post counts |
| `client.search.places()` | `GET /search/places` | 1 |  | Find places by name |
| `client.search.music()` | `GET /search/music` | 1 | yes | Find tracks by title or artist |
| `client.search.reels()` | `GET /search/reels` | 1 | yes | Find reels for a text |
| `client.search.top()` | `GET /search/top` | 1 | yes | The top posts for a text |
| `client.track.get()` | `GET /track` | 1 |  | Track title, artist, length and audio link |
| `client.resolve()` | `GET /resolve` | 1, or 2 for share links |  | Turn a post, reel or share link into data |
| `client.shop.storefront()` | `GET /shop/storefront` | 1 |  | An account's shop: collections and first products |
| `client.shop.products()` | `GET /shop/products` | 1 | yes | Products in a shop collection |
| `client.tiktok.video()` | `GET /tiktok/video` | 1 |  | One TikTok video without the watermark, with views, likes, comments and shares |
| `client.tiktok.user.profile()` | `GET /tiktok/user/profile` | 1 |  | TikTok profile with followers, following, likes and video count |
| `client.tiktok.user.videos()` | `GET /tiktok/user/videos` | 1 | yes | A TikTok account's videos with numbers, page by page; file links on page one |
| `client.tiktok.user.stories()` | `GET /tiktok/user/stories` | 1 |  | TikTok stories live now |
| `client.tiktok.user.followers()` | `GET /tiktok/user/followers` | 1 | yes | TikTok followers, page by page; a hidden list answers an empty page |
| `client.tiktok.user.following()` | `GET /tiktok/user/following` | 1 | yes | TikTok accounts followed, page by page; a hidden list answers an empty page |
| `client.tiktok.user.reposts()` | `GET /tiktok/user/reposts` | 1 | yes | Videos a TikTok account reposted, page by page, with their authors |
| `client.download()` | `GET /download` | 1 |  | Files of an Instagram post or reel, or a TikTok video, by link |
| `client.account()` | `GET /account` | 0 |  | Your plan, balance, free units and use |
<!-- methods:end -->

Parameters, in short:

- TikTok calls (`tiktok.user.*`) take `{ username }`, and `tiktok.video` and `download` take `{ url }`. The paged TikTok calls also take `cursor`.
- Account calls (`user.*`, `shop.storefront`) take `{ username }` or `{ id }`. The calls with a cursor also take `cursor`. `user.followersSearch` and `user.followingSearch` also take `q`.
- Post calls (`post.*`) take `{ url }`, `{ code }` (the part of the link after `/p/` or `/reel/`) or `{ id }`. `post.comments` takes `cursor`. `post.commentReplies` also takes `comment_id`.
- `story.get` and `highlight.get` take `{ url }` or `{ id }`.
- `hashtag.posts` takes `name`, `sort` (`top`, `recent` or `reels`; keep it the same from page to page) and `cursor`. `location.posts` takes `id`, `sort` (`top` or `recent`) and `cursor`.
- `location.search` takes `q`, or `lat` and `lng`. The `search.*` calls take `q`, 1 to 100 characters.
- `post.get` returns the whole post: `media` (the links to its pictures and video, one entry per slide of a carousel), caption, owner, time, and the numbers. It is the same shape as an item of `user.posts`, `user.reels`, `hashtag.posts` and the other lists of posts, and `resolve` returns it for a post link.

## Docs

- API docs, with a page for each endpoint: <https://storiesfly.com/developers/docs>
- OpenAPI 3.1 spec: <https://storiesfly.com/openapi.json> (this repository holds a copy as [`openapi.json`](openapi.json) and [`openapi.yaml`](openapi.yaml))
- API changelog: <https://storiesfly.com/developers/changelog>
- Changelog of this package: [CHANGELOG.md](CHANGELOG.md)
- Examples: [`stories.mjs`](examples/stories.mjs) (stories of an account), [`followers.mjs`](examples/followers.mjs) (followers with `paginate`) and [`post.mjs`](examples/post.mjs) (a post with its media links and numbers). Run them with `STORIESFLY_API_KEY=your_key node examples/stories.mjs instagram`.

## Migrating from 0.x

1.0 is a rewrite for API v1. The old methods are gone, the base URL changed, and the old plans and daily quotas do not exist in v1.

| 0.x | 1.0 |
| --- | --- |
| `getStories(username)` | `user.stories({ username })`. It returns `{ user, stories }`. The profile and the highlights are separate calls (`user.profile`, `user.highlights`), and you pay for each. |
| `getProfile(username)` | `user.profile({ username })`. It also gives `id`, `bio`, `verified` and `external_url`. |
| `getHighlights(id)` | `highlight.get({ id })`, with every story in the highlight. `user.highlights` lists the highlights of an account. |
| `getMedia(url)` | `post.get({ url })`. It returns the whole post: `media` holds the picture and video links (`image_url`, `video_url`, one entry per slide of a carousel), with the caption, owner, time and the counts. |
| `download(url)` | `download({ url })` in 1.1 returns the file links of a post, reel or TikTok video. `post.get` also gives the media links. |
| `getTrackerEvents`, `listTrackedAccounts`, `addTrackedAccount`, `removeTrackedAccount`, `checkShadowban`, `getOutboundEngagement` | Not part of API v1, so not in 1.0. |

What else changed:

- `baseUrl` now defaults to `https://storiesfly.com/api/v1`. The `bearerToken` option is gone: v1 takes the key in `X-Api-Key` and nowhere else.
- Methods are grouped by resource: `client.user.profile()`, `client.post.get()`, `client.search.users()`. Every method takes one object of parameters.
- Answers use the API's own `snake_case` names, and `null` for a value that is missing: `fullName` is now `full_name`, `profilePicUrl` is `profile_pic_url`, `isPrivate` is `is_private`, `takenAt` is `taken_at`.
- `StoriesFlyError` has `code`, `requestId` and `retryAfterMs`. The 0.x fields `rateLimit`, `retryAfterSec`, `requiresUpgrade`, `isRateLimited` and `method` are gone. Compare `err.code` with `rate_limited`, `credits_exhausted` and the rest. A `429` is now retried for you.
- The old plans (DEV, Starter, Growth, Scale, and the Tracker plans), their daily quotas and the 60 requests a minute burst limit are gone. v1 bills from a prepaid balance, per request, with 100 free requests for a new account. See [Pricing](#pricing).
- A key from before works on v1 once the account behind it is linked to Telegram. Until then v1 answers `telegram_required`, and `err.linkUrl` has the link.
- The tracker, shadow ban and outbound analytics endpoints still answer over HTTP, but 1.0 does not wrap them. To keep using them, stay on `storiesfly@0` or call them yourself. The older `/api/stories`, `/api/profile`, `/api/highlights`, `/api/media` and `/api/download` endpoints that 0.x calls keep working for existing free keys until 2026-12-31. Details: <https://storiesfly.com/developers/docs/legacy>.

## FAQ

**Does it need an Instagram or TikTok login?**
No. You send a StoriesFly API key and nothing else. There are no cookies or sessions to manage.

**Can I get a TikTok account's followers list?**
Yes. `client.tiktok.user.followers({ username })` returns it page by page, and `client.paginate` follows the pages. An account that hides the list answers an empty page with `hidden: true`.

**Can I download a TikTok video without the watermark?**
Yes. `client.tiktok.video({ url })` returns `video_url` without the watermark, and `client.download({ url })` returns the file links for an Instagram or TikTok link.

**Can I use it from ChatGPT or Claude?**
Yes, through the MCP server at `https://storiesfly.com/mcp`. See [Use it from ChatGPT and Claude (MCP)](#use-it-from-chatgpt-and-claude-mcp).

**How is it priced?**
Per request, from prepaid balance. A new account gets 100 free requests, once. See [Pricing](#pricing).

## Not affiliated

This is a client for the StoriesFly API. It reads public data only, and a private account gives `private_account`. It is not an Instagram or Meta product and is not affiliated with or endorsed by them.

## Development

```sh
npm install
npm test               # clean, build, compile the tests and run them
npm run openapi:check  # validate openapi.json and openapi.yaml, and check that they match
npm run readme:check   # check the method table above against the spec
```

To update the spec: replace `openapi.json` with the new file, run `npm run openapi:sync` and `npm run readme:sync`, and run the tests.

## License

MIT. See [LICENSE](LICENSE).
