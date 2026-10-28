# Changelog

## 1.1.0 - 2026-10-28

### Added

- TikTok: `client.tiktok.video()`, `client.tiktok.user.profile()`, `.videos()`, `.stories()`, `.followers()`, `.following()` and `.reposts()`. `videos`, `followers`, `following` and `reposts` take `cursor` and work with `client.paginate`.
- `client.download({ url })`: the file links of an Instagram post, reel or IGTV, or a TikTok video or photo post, at a fixed price per call.
- Types `TikTokVideo`, `TikTokProfile`, `TikTokUserShort`, `TikTokVideosPage`, `TikTokUsersPage`, `TikTokUserStories`, `TikTokStory`, `Download` and `DownloadFile`.
- `download_price_usd` on the `account` answer.
- README sections for TikTok, download, the MCP server (ChatGPT and Claude) and a short FAQ.

### Changed

- `openapi.json` and `openapi.yaml` are the spec as served today: 47 paths, 46 data endpoints and `account`. The README method table is regenerated.
- `download` is a method again: in 1.0 it was removed, and in 1.1 it returns file links.

## 1.0.0

A rewrite for StoriesFly API v1 (`https://storiesfly.com/api/v1`). This release breaks the 0.x API; see "Migrating from 0.x" in the README.

### Added

- A method for every endpoint of API v1: 38 data calls and the free `account` call, grouped by resource (`client.user`, `client.post`, `client.comment`, `client.story`, `client.highlight`, `client.hashtag`, `client.location`, `client.search`, `client.track`, `client.shop`, plus `client.resolve()` and `client.account()`). A test holds the method table equal to the paths of the OpenAPI spec.
- `client.paginate(method, params, { maxPages, signal, withMeta })`: an async iterator that follows `next_cursor` until `has_more` is `false`.
- `{ withMeta: true }` on every call and on `paginate`: resolves to `{ data, meta }`, where `meta` holds `requestId`, `unitsCharged`, `balanceRemaining`, `freeUnitsRemaining`, `rateLimitLimit` and `rateLimitRemaining` from the response headers.
- Types for every answer (`snake_case`, `null` for a missing value) and for the parameters of every call. A call that sends both `username` and `id`, or neither, does not compile.
- `post.get`, and `resolve` for a post link, return the whole post: `media` with the picture and video links (one entry per slide of a carousel), caption, owner, time and the counts. The type is `Post`, the same as an item of every list of posts.
- `StoriesFlyError` with `status`, `code`, `requestId`, `retryAfterMs`, `fields`, `linkUrl` and `meta`. The codes are the API's (`bad_request`, `unauthorized`, `telegram_required`, `private_account`, `not_found`, `rate_limited`, `credits_exhausted`, `upstream_unavailable`, `internal_error`, `unknown_endpoint`), plus `timeout`, `network_error` and `invalid_response` set by the client. `API_ERROR_CODES` lists them.
- A `429` is retried up to `maxRetries` times (default 2), after the `Retry-After` the API sends. A `402` is never retried.
- Options `timeoutMs` (default 60000) and `maxRetries`, and per-call `signal`, `timeoutMs` and `maxRetries`.
- `openapi.json`, the spec of API v1, and `openapi.yaml`, the same document in YAML. `npm run openapi:check` validates both and checks that they match.
- Examples: stories of an account, followers with `paginate`, and a post with its media links and numbers.

### Changed

- The default `baseUrl` is `https://storiesfly.com/api/v1`.
- Answers keep the API's `snake_case` names (`full_name`, `is_private`, `taken_at`) and are not renamed to camelCase.
- The README method table is generated from the spec. Its `Paged` column shows the page size where the spec gives one (`x-page-size`: 9 for `user.posts`, 25 for `user.followers` and `user.following`).

### Removed

- `getStories`, `getProfile`, `getHighlights`, `getMedia` and `download`. Use `user.stories`, `user.profile`, `highlight.get` and `post.get`. There is no replacement for `download`: media links in answers are CDN links to download in your own code.
- `getTrackerEvents`, `listTrackedAccounts`, `addTrackedAccount`, `removeTrackedAccount`, `checkShadowban` and `getOutboundEngagement`. These endpoints are not part of API v1.
- The `bearerToken` option, and the `rateLimit`, `retryAfterSec`, `requiresUpgrade`, `isRateLimited` and `method` fields of the error.
- The old plans and daily quotas. API v1 is prepaid: from $1.50 per 1,000 requests, with 100 free requests after signing in with Telegram.

## 0.1.0

First release: a client for the older `/api/` endpoints (stories, profile, highlights, media, download, shadow ban and the follower tracker).
