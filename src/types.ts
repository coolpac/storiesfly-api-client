/**
 * Request and response shapes for the StoriesFly API.
 *
 * Every type here was read off the route handler that produces it (and, for
 * database-backed rows, off the Prisma model behind that handler). Where a
 * response is assembled from data the handler does not fully constrain — a
 * `Json` column, an upstream payload passed straight through — the field is
 * typed loosely on purpose rather than guessed at.
 */

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * JSON error body. Every handler answers failures with at least `error`;
 * the remaining fields appear on specific paths (quota, tier, session).
 */
export interface ApiErrorBody {
  error?: string;
  /** Set to `SESSION_EXPIRED` on an expired Bearer token. */
  code?: string;
  /** Present on quota / tier refusals. */
  upgrade?: boolean;
  /** Present on tier refusals, e.g. `"PRO"`. */
  requiredTier?: string;
  limit?: number;
  used?: number;
  retryAfterSec?: number;
  [key: string]: unknown;
}

/**
 * Rate-limit state read off response headers.
 *
 * `X-RateLimit-*` are set by the content endpoints (stories, profile,
 * highlights, media, download) on both success and quota refusal. The tracker
 * and analytics endpoints do not set them, so every field is optional.
 */
export interface RateLimitInfo {
  /** `X-RateLimit-Limit` */
  limit?: number;
  /** `X-RateLimit-Remaining` */
  remaining?: number;
  /** `X-RateLimit-Used` */
  used?: number;
  /** `Retry-After` header, falling back to `retryAfterSec` in the body. */
  retryAfterSec?: number;
}

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

export type MediaType = "image" | "video";

/** Profile object embedded in the `POST /api/stories` response. */
export interface StoryProfile {
  /** Instagram numeric user id. Empty string when the upstream fetch failed. */
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  posts: number;
  followers: number;
  following: number;
  isPrivate: boolean;
  bio?: string;
}

export interface Story {
  id: string;
  mediaType: MediaType;
  source: string;
  thumbnail?: string;
  /** ISO 8601 timestamp. */
  takenAt: string;
  /** True when the archived file is gone and the CDN URL has expired. */
  expired?: boolean;
}

/** Highlight reel cover, as listed alongside stories. */
export interface HighlightReel {
  id: string;
  title: string;
  coverUrl: string;
}

/** `POST /api/stories` */
export interface StoriesResponse {
  profile: StoryProfile;
  stories: Story[];
  highlights: HighlightReel[];
  /** True when served from the server-side profile cache without a live fetch. */
  fromCache: boolean;
}

/**
 * `GET /api/profile`
 *
 * Assembled field-by-field by the handler from the cached-profile row (or a
 * live fetch). `fullName` and `profilePicUrl` are nullable columns. `bio` is
 * stored but is not part of the response — see README, "Docs vs. handler".
 */
export interface ProfileResponse {
  username: string;
  fullName: string | null;
  profilePicUrl: string | null;
  posts: number;
  followers: number;
  following: number;
  isPrivate: boolean;
}

/** One item inside a highlight reel. */
export interface HighlightItem {
  id: string;
  mediaType: MediaType;
  source: string;
  thumbnail?: string;
  /** ISO 8601 timestamp. */
  takenAt: string;
}

/** `GET /api/highlights` */
export interface HighlightsResponse {
  items: HighlightItem[];
}

export interface MediaItem {
  type: MediaType;
  url: string;
  thumbnail?: string;
}

/** `POST /api/media` */
export interface MediaResponse {
  media: MediaItem[];
}

/** `POST /api/media` accepts a post/reel URL, a bare shortcode, or both. */
export type MediaRequest =
  | { url: string; shortcode?: string }
  | { url?: string; shortcode: string };

/** `GET /api/download` — the only endpoint that answers with bytes, not JSON. */
export interface DownloadResult {
  /** `Content-Type` as sent by the proxy, e.g. `image/jpeg` or `video/mp4`. */
  contentType: string;
  /** Filename from `Content-Disposition`, e.g. `storiesfly_1717000000000.jpg`. */
  filename: string | null;
  data: Uint8Array;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

export type ShadowbanStatus = "ok" | "warning" | "critical";

export type ShadowbanVerdict = "clean" | "possibly_limited" | "likely_shadowbanned";

export interface ShadowbanSignal {
  name: string;
  status: ShadowbanStatus;
  description: string;
  weight: number;
}

/** `GET /api/analytics/shadowban` */
export interface ShadowbanResponse {
  username: string;
  /** 0 (clean) to 100 (likely shadowbanned). */
  score: number;
  verdict: ShadowbanVerdict;
  signals: ShadowbanSignal[];
  /** ISO 8601 timestamp. */
  checkedAt: string;
  recommendations: string[];
}

export interface OutboundTarget {
  username: string;
  likes: number;
  comments: number;
}

export interface OutboundActivity {
  type: "like" | "comment";
  targetUsername: string;
  targetPostId: string;
  /** Free-form JSON column — the handler passes it through untouched. */
  details: Record<string, unknown>;
  /** ISO 8601 timestamp. */
  detectedAt: string;
}

/** `GET /api/analytics/outbound` */
export interface OutboundEngagementResponse {
  username: string;
  days: number;
  totalLikes: number;
  totalComments: number;
  /** Top 15 targets by likes + comments. */
  topTargets: OutboundTarget[];
  /** 50 most recent outbound events. */
  recentActivity: OutboundActivity[];
}

/* -------------------------------------------------------------------------- */
/* Tracker                                                                     */
/* -------------------------------------------------------------------------- */

export type TrackerSyncStatus = "PENDING" | "SYNCING" | "READY" | "FAILED";

export type ActivityType =
  | "LIKE"
  | "COMMENT"
  | "FOLLOW"
  | "UNFOLLOW"
  | "STORY_POST"
  | "FOLLOWER_ADDED"
  | "FOLLOWER_REMOVED"
  | "OUTBOUND_LIKE"
  | "OUTBOUND_COMMENT";

/**
 * A tracked account row, as returned in full by `POST /api/tracker/accounts`
 * and (with `deepAnalytics` attached) by `GET /api/tracker`.
 *
 * `initialFollowers` / `initialFollowing` are the counts captured when the
 * account was added — they are a baseline, not live counts.
 */
export interface TrackedAccount {
  id: string;
  userId: string;
  igUsername: string;
  igUserId: string | null;
  initialFollowers: number | null;
  initialFollowing: number | null;
  storyOnly: boolean;
  trackLikes: boolean;
  trackFollows: boolean;
  trackFollowers: boolean;
  trackStories: boolean;
  notifyNewStory: boolean;
  syncStatus: TrackerSyncStatus;
  syncRetries: number;
  /** ISO 8601 timestamp, or null before the first poll. */
  lastPolledAt: string | null;
  lastDiffAt: string | null;
  lastStoryPolledAt: string | null;
  createdAt: string;
}

/**
 * The narrower projection returned by `GET /api/tracker/accounts` — the handler
 * selects an explicit subset, so `userId`, `trackLikes`, `syncRetries` and
 * `lastDiffAt` are absent there.
 */
export type TrackedAccountSummary = Pick<
  TrackedAccount,
  | "id"
  | "igUsername"
  | "igUserId"
  | "initialFollowers"
  | "initialFollowing"
  | "storyOnly"
  | "trackFollows"
  | "trackFollowers"
  | "trackStories"
  | "notifyNewStory"
  | "syncStatus"
  | "lastPolledAt"
  | "lastStoryPolledAt"
  | "createdAt"
>;

/** Deep Analytics addon state, as selected into `GET /api/tracker`. */
export interface DeepAnalyticsAddonSummary {
  active: boolean;
  trialEndsAt: string | null;
  endsAt: string | null;
}

export type TrackedAccountWithAddon = TrackedAccount & {
  deepAnalytics: DeepAnalyticsAddonSummary | null;
};

/** `GET /api/tracker/accounts` */
export interface TrackedAccountsResponse {
  accounts: TrackedAccountSummary[];
}

/**
 * One activity-log row.
 *
 * The column is `activityType`, not `type`. `targetUsername` is a real column,
 * but some producers write it into `details` instead, so read both.
 */
export interface TrackerActivity {
  id: string;
  igUsername: string;
  activityType: ActivityType;
  targetUsername: string | null;
  targetPostId: string | null;
  /** Free-form JSON column; shape varies by `activityType`. */
  details: Record<string, unknown> | null;
  /** ISO 8601 timestamp. */
  detectedAt: string;
}

/** `GET /api/tracker` */
export interface TrackerEventsResponse {
  accounts: TrackedAccountWithAddon[];
  activities: TrackerActivity[];
  /** Total activity rows before pagination and de-duplication. */
  total: number;
  page: number;
  pages: number;
}

/** `GET /api/tracker` query. Server defaults: page 1, limit 200. */
export interface TrackerEventsParams {
  /** 1-100. */
  page?: number;
  /** 20-500. */
  limit?: number;
}

/** `DELETE /api/tracker/accounts` */
export interface RemoveTrackedAccountResponse {
  success: true;
}
