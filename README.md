# storiesfly

[![CI](https://github.com/coolpac/storiesfly-api-client/actions/workflows/ci.yml/badge.svg)](https://github.com/coolpac/storiesfly-api-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/storiesfly.svg)](https://www.npmjs.com/package/storiesfly)

TypeScript client for the [StoriesFly](https://storiesfly.com) HTTP API — public Instagram stories, profiles, highlights, post media, shadow ban checks and follower/unfollower tracking.

## Install

```sh
npm install storiesfly
```

## Quickstart

```js
import { StoriesFly } from "storiesfly";

const sf = new StoriesFly({ apiKey: process.env.STORIESFLY_API_KEY });
const { profile, stories } = await sf.getStories("instagram");
console.log(`@${profile.username} — ${stories.length} active stories`);
```

Node 18+. ESM only. Zero runtime dependencies — it uses the global `fetch`.
Base URL defaults to `https://storiesfly.com` and can be overridden with `baseUrl`.

## Endpoints

| Method | Path | Client method | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/stories` | `getStories(username)` | `{ profile, stories, highlights, fromCache }` — the account's profile, its currently active stories, and its highlight covers |
| `GET` | `/api/profile` | `getProfile(username)` | `{ username, fullName, profilePicUrl, posts, followers, following, isPrivate }` |
| `GET` | `/api/highlights` | `getHighlights(id)` | `{ items }` — one entry per media item in a highlight reel |
| `POST` | `/api/media` | `getMedia(urlOrInput)` | `{ media }` — `[{ type, url, thumbnail? }]`, one entry per carousel slide |
| `GET` | `/api/download` | `download(url)` | `{ contentType, filename, data }` — raw bytes proxied off the Instagram CDN, not JSON |
| `GET` | `/api/analytics/shadowban` | `checkShadowban(username)` | `{ username, score, verdict, signals, checkedAt, recommendations }` |
| `GET` | `/api/tracker` | `getTrackerEvents({ page, limit })` | `{ accounts, activities, total, page, pages }` — tracked accounts plus a paginated activity feed |
| `GET`/`POST`/`DELETE` | `/api/tracker/accounts` | `listTrackedAccounts()` / `addTrackedAccount(igUsername)` / `removeTrackedAccount(accountId)` | `{ accounts }` / the created account row, unwrapped / `{ success: true }` |
| `GET` | `/api/analytics/outbound` | `getOutboundEngagement(username, { days })` | `{ username, days, totalLikes, totalComments, topTargets, recentActivity }` |

### Parameter notes

- **Usernames** must match `[a-zA-Z0-9._]{1,30}`. On `/api/stories`, `/api/profile` and
  `/api/tracker/accounts` the pattern is checked *before* normalisation, so a leading `@`
  is a `400`. The two analytics endpoints normalise first and accept `@name`.
- **`getHighlights(id)`** — the id must match `(highlight:)?[0-9_]{1,64}`. Reel ids come back
  from `getStories()` in the `highlights` array.
- **`getMedia()`** — accepts a post/reel URL string, `{ url }`, or `{ shortcode }`. URLs are
  capped at 500 characters. A link no shortcode can be extracted from returns `400`.
- **`download(url)`** — host allowlist only: any subdomain of `cdninstagram.com`, `fbcdn.net`
  or `instagram.com`, plus the exact hosts `cdn.iqsaved.com` and `pic.anonstories.org`.
  Anything else is `403`; an unparseable URL is `400`.
- **`getTrackerEvents()`** — `page` is an integer 1–100 (default 1), `limit` an integer
  20–500 (default 200). Out-of-range values are rejected with `400`, not clamped.
- **`removeTrackedAccount(accountId)`** — takes the tracked account's `id` (a cuid), not the
  Instagram username.
- **`getOutboundEngagement()`** — `days` is clamped server-side to 1–90, default 30.

### Tracker specifics

- A newly added account starts at `syncStatus: "PENDING"`; its first follower/following
  snapshots run in the background, so no activity appears for it until that completes.
- Activity rows use **`activityType`**, not `type`. Values: `LIKE`, `COMMENT`, `FOLLOW`,
  `UNFOLLOW`, `STORY_POST`, `FOLLOWER_ADDED`, `FOLLOWER_REMOVED`, `OUTBOUND_LIKE`,
  `OUTBOUND_COMMENT`.
- Tracked accounts carry `initialFollowers` / `initialFollowing` — the baseline captured when
  tracking started, not live counts. Use `getProfile()` for current numbers.
- Only public accounts can be tracked, and there is a server-side ceiling on how many
  followers a trackable account may have.

## Authentication

Create a key at **<https://storiesfly.com/developers>** and pass it to the constructor; the
client sends it as the `X-Api-Key` header on every request.

```js
const sf = new StoriesFly({ apiKey: "sf_live_your_key_here" });
```

One key covers every endpoint — there is no separate tracker token. A key that is invalid,
revoked or mistyped returns `401` rather than silently falling back to an anonymous
allowance.

**`getOutboundEngagement()` is the one exception.** That handler resolves auth with a
Bearer-only helper and never reads `X-Api-Key`, so it needs a first-party session JWT:

```js
const sf = new StoriesFly({ apiKey: "...", bearerToken: process.env.STORIESFLY_JWT });
```

The token is sent only on that call, so it cannot change which credential the other
endpoints resolve.

### Errors

Every non-2xx response throws `StoriesFlyError`, carrying `status`, the parsed `body`, the
request `url` and `method`, plus `rateLimit` read off the response headers. It exposes
`isRateLimited`, `retryAfterSec` and `requiresUpgrade` helpers.

```js
import { StoriesFly, StoriesFlyError } from "storiesfly";

try {
  await sf.getStories("instagram");
} catch (err) {
  if (err instanceof StoriesFlyError && err.isRateLimited) {
    console.log(`retry in ${err.retryAfterSec}s`);
  }
}
```

| Status | Meaning |
| --- | --- |
| `400` | Malformed parameter (bad username, unparseable post URL, out-of-range `page`/`limit`) |
| `401` | Missing, invalid or revoked credentials |
| `403` | Plan does not cover the endpoint, tier limit reached (`requiresUpgrade`), or a download host outside the allowlist |
| `404` | Account, post or tracked account not found |
| `429` | Burst or daily quota exhausted — honour `retryAfterSec` |
| `502` | Upstream Instagram fetch failed; retry later |

## Rate limits

A burst ceiling of **60 requests/minute** applies on top of the daily quotas below.

Content API — `getStories`, `getProfile`, `getHighlights`, `getMedia`, `download`:

| Plan | Price | Requests/day |
| --- | --- | --- |
| DEV | Free | 25 |
| Starter | $9.99/mo | 500 |
| Growth | $29.99/mo | 5,000 |
| Scale | $99/mo | 50,000 |

Tracker API — `getTrackerEvents`, `listTrackedAccounts`, `addTrackedAccount`, `removeTrackedAccount`:

| Plan | Price | Requests/day | Tracked accounts |
| --- | --- | --- | --- |
| Tracker Starter | $4.99/mo | 100 | 1 |
| Tracker Growth | $14.99/mo | 500 | 5 |
| Tracker Scale | $49/mo | 5,000 | 10 |

Content and Tracker are sold separately: a Content plan does not grant tracker access, and a
Tracker plan does not grant content access. Web subscriptions (Basic $4.99, Pro $19.99)
include tracker access; Pro additionally includes 5,000 content requests/day.

Two endpoints are metered differently:

- **`checkShadowban()`** draws on a separate analysis quota: 0/day on free and DEV keys,
  10/day on Basic, unlimited on Pro and Enterprise. A DEV key therefore gets `429` on its
  first call.
- **`getOutboundEngagement()`** additionally requires a Pro-or-higher subscription, the
  target to be one of your tracked accounts, and an active Deep Analytics add-on on that
  account.

Content endpoints report remaining quota via `X-RateLimit-*` headers; the tracker and
analytics endpoints do not set them, so `rateLimit` fields are optional throughout.

## Docs vs. handler

Response types in this package were read off the route handlers, which in several places
disagree with the examples published at `/developers/docs`. Where they differ, this client
follows the handler:

- **`POST /api/stories`** returns `{ profile, stories, highlights, fromCache }`. The published
  example shows `{ username, items[] }`, which no code path produces.
- **`GET /api/profile`** does not return `bio`. It is cached server-side but left out of the
  response object the handler assembles.
- **`GET /api/tracker`** returns `{ accounts, activities, total, page, pages }`. The published
  example omits the three pagination fields, calls the event kind `type` (it is
  `activityType`), and shows `followers` / `following` on tracked accounts — those fields do
  not exist; the row has `initialFollowers` / `initialFollowing`.
- **`POST /api/tracker/accounts`** returns the created account row unwrapped, not
  `{ accounts: [...] }`.
- **`DELETE /api/tracker/accounts`** validates `accountId` as a cuid (`^c[a-z0-9]+$`, 20–30
  chars). The `acc_123` shown in the published curl example returns `400`.
- **`GET /api/analytics/outbound`** reads `Authorization: Bearer` only and ignores
  `X-Api-Key`; pass `bearerToken` to the client for this one endpoint.
- **`GET /api/download`** also allows the exact hosts `cdn.iqsaved.com` and
  `pic.anonstories.org` beyond the three Instagram CDN domains listed in the docs.
- **`GET /api/analytics/shadowban`** accepts an undocumented `locale` query parameter that
  translates signal text and recommendations.
- **`GET /api/highlights`** returns `takenAt` on each item, which the published example omits.

## Examples

- [`examples/stories.mjs`](examples/stories.mjs) — fetch the active stories for a public account.
- [`examples/unfollowers.mjs`](examples/unfollowers.mjs) — list tracker events and print follow/unfollow changes.

```sh
npm install && npm run build
export STORIESFLY_API_KEY=sf_live_your_key_here
node examples/stories.mjs instagram
```

## What this is not

- **Not a scraper.** This package makes HTTP calls to StoriesFly's hosted API. It does not
  talk to Instagram, and nothing in it works standalone or offline.
- **Not usable without a key.** Anonymous access exists only for same-origin browser
  requests from storiesfly.com; scripted callers without a key get `401`.
- **Not a way into private accounts.** Every endpoint operates on publicly visible data.
  Private accounts return an error or empty data, and tracking one is refused.
- **Not an official Instagram or Meta product,** and not affiliated with or endorsed by them.

## Documentation

- API reference: <https://storiesfly.com/developers/docs>
- Get an API key: <https://storiesfly.com/developers>
- Plans and quotas: <https://storiesfly.com/developers/tiers>

## License

MIT — see [LICENSE](LICENSE).
