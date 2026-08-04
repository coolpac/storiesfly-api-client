import { StoriesFlyError } from "./errors.js";
import type {
  DownloadResult,
  HighlightsResponse,
  MediaRequest,
  MediaResponse,
  OutboundEngagementResponse,
  ProfileResponse,
  RateLimitInfo,
  RemoveTrackedAccountResponse,
  ShadowbanResponse,
  StoriesResponse,
  TrackedAccount,
  TrackedAccountsResponse,
  TrackerEventsParams,
  TrackerEventsResponse,
} from "./types.js";

export * from "./types.js";
export { StoriesFlyError } from "./errors.js";

/** Minimal `fetch` surface used by the client. The global `fetch` satisfies it. */
export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface StoriesFlyOptions {
  /** API key, sent as `X-Api-Key`. Create one at https://storiesfly.com/developers */
  apiKey: string;
  /** Defaults to `https://storiesfly.com`. Trailing slashes are ignored. */
  baseUrl?: string;
  /** Injectable `fetch`, for tests or a custom agent. Defaults to the global. */
  fetch?: FetchLike;
  /**
   * Optional session JWT.
   *
   * Only `getOutboundEngagement` uses it: that handler resolves auth with the
   * Bearer-only helper and ignores `X-Api-Key` entirely. Every other method
   * authenticates with the API key alone, so setting this does not change them.
   */
  bearerToken?: string;
}

/** Per-call options. */
export interface RequestOptions {
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = "https://storiesfly.com";

type QueryValue = string | number | boolean | undefined | null;

/** Serialises defined values only; returns `""` when nothing is left. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }
  const serialised = search.toString();
  return serialised === "" ? "" : `?${serialised}`;
}

function readRateLimit(headers: Headers, body: unknown): RateLimitInfo {
  const info: RateLimitInfo = {};
  const num = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw === null) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const limit = num("x-ratelimit-limit");
  if (limit !== undefined) info.limit = limit;
  const remaining = num("x-ratelimit-remaining");
  if (remaining !== undefined) info.remaining = remaining;
  const used = num("x-ratelimit-used");
  if (used !== undefined) info.used = used;

  const retryAfter = num("retry-after");
  if (retryAfter !== undefined) {
    info.retryAfterSec = retryAfter;
  } else if (typeof body === "object" && body !== null) {
    const fromBody = (body as { retryAfterSec?: unknown }).retryAfterSec;
    if (typeof fromBody === "number") info.retryAfterSec = fromBody;
  }

  return info;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (text === "") return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function filenameFrom(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const quoted = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename=([^;]+)/i.exec(contentDisposition);
  return bare?.[1]?.trim() ?? null;
}

/**
 * Client for the StoriesFly API.
 *
 * ```ts
 * const sf = new StoriesFly({ apiKey: process.env.STORIESFLY_API_KEY! });
 * const { stories } = await sf.getStories("instagram");
 * ```
 */
export class StoriesFly {
  readonly baseUrl: string;

  #apiKey: string;
  #fetch: FetchLike;
  #bearerToken: string | undefined;

  constructor(options: StoriesFlyOptions) {
    if (!options?.apiKey) {
      throw new TypeError("StoriesFly: `apiKey` is required");
    }
    this.#apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#bearerToken = options.bearerToken;

    const injected = options.fetch;
    if (injected) {
      this.#fetch = injected;
    } else if (typeof globalThis.fetch === "function") {
      this.#fetch = globalThis.fetch.bind(globalThis) as FetchLike;
    } else {
      throw new TypeError(
        "StoriesFly: no global `fetch` available (Node 18+ required). Pass `fetch` explicitly."
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Content                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * `POST /api/stories` — active stories, profile and highlight covers for a
   * public account.
   *
   * The username must match `[a-zA-Z0-9._]{1,30}`; the server validates before
   * normalising, so a leading `@` is rejected with 400.
   */
  getStories(username: string, options?: RequestOptions): Promise<StoriesResponse> {
    return this.#json<StoriesResponse>("POST", "/api/stories", {
      body: { username },
      signal: options?.signal,
    });
  }

  /** `GET /api/profile` — cached profile, falling back to a live fetch. */
  getProfile(username: string, options?: RequestOptions): Promise<ProfileResponse> {
    return this.#json<ProfileResponse>("GET", "/api/profile", {
      query: { username },
      signal: options?.signal,
    });
  }

  /**
   * `GET /api/highlights` — items inside one highlight reel.
   *
   * `id` must match `(highlight:)?[0-9_]{1,64}` or the server answers 400.
   */
  getHighlights(id: string, options?: RequestOptions): Promise<HighlightsResponse> {
    return this.#json<HighlightsResponse>("GET", "/api/highlights", {
      query: { id },
      signal: options?.signal,
    });
  }

  /**
   * `POST /api/media` — direct media URLs for a post, reel or carousel.
   *
   * Accepts a post URL, or a `{ shortcode }` object. A URL that no shortcode
   * can be extracted from is rejected with 400.
   */
  getMedia(input: string | MediaRequest, options?: RequestOptions): Promise<MediaResponse> {
    const body = typeof input === "string" ? { url: input } : input;
    return this.#json<MediaResponse>("POST", "/api/media", {
      body,
      signal: options?.signal,
    });
  }

  /**
   * `GET /api/download` — proxy a media file off the Instagram CDN.
   *
   * Host allowlist: `cdninstagram.com`, `fbcdn.net` and `instagram.com` (and any
   * subdomain), plus the exact hosts `cdn.iqsaved.com` and `pic.anonstories.org`.
   * Bare IPs and `localhost` are always refused. Anything off the list is 403;
   * an unparseable URL is 400. Returns bytes, not JSON.
   */
  async download(url: string, options?: RequestOptions): Promise<DownloadResult> {
    const res = await this.#send("GET", "/api/download", {
      query: { url },
      signal: options?.signal,
    });
    const buffer = await res.arrayBuffer();
    return {
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      filename: filenameFrom(res.headers.get("content-disposition")),
      data: new Uint8Array(buffer),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Analytics                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * `GET /api/analytics/shadowban` — weighted shadow ban assessment.
   *
   * Counts against the `aiAnalyses` quota, which is 0/day on the free tier.
   * `locale` asks the server to translate signal text and recommendations.
   */
  checkShadowban(
    username: string,
    params?: { locale?: string },
    options?: RequestOptions
  ): Promise<ShadowbanResponse> {
    return this.#json<ShadowbanResponse>("GET", "/api/analytics/shadowban", {
      query: { username, locale: params?.locale },
      signal: options?.signal,
    });
  }

  /**
   * `GET /api/analytics/outbound` — where a tracked account leaves likes and
   * comments.
   *
   * Requires a PRO web subscription *and* an active Deep Analytics addon on
   * that tracked account. This handler authenticates with Bearer JWT only — an
   * API key alone always yields 401, so pass `bearerToken` to the constructor.
   *
   * `days` is clamped server-side to 1-90 and defaults to 30.
   */
  getOutboundEngagement(
    username: string,
    params?: { days?: number },
    options?: RequestOptions
  ): Promise<OutboundEngagementResponse> {
    // Fail here rather than at the server. This handler resolves auth with a
    // Bearer-only helper, so an API key alone comes back as a bare
    // 401 {"error":"Unauthorized"} with nothing to say the credential type was
    // the problem — the one error in this API a caller cannot diagnose.
    if (!this.#bearerToken) {
      throw new StoriesFlyError({
        status: 0,
        body: {
          error:
            "getOutboundEngagement requires a session JWT. Construct the client with " +
            "{ bearerToken } — this endpoint does not accept X-Api-Key.",
        },
        rateLimit: undefined,
        url: `${this.baseUrl}/api/analytics/outbound`,
        method: "GET",
      });
    }
    return this.#json<OutboundEngagementResponse>("GET", "/api/analytics/outbound", {
      query: { username, days: params?.days },
      bearer: true,
      signal: options?.signal,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Tracker                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * `GET /api/tracker` — tracked accounts plus a paginated activity feed.
   *
   * Requires a paid web tier or a Tracker API plan; otherwise 403.
   * Server defaults: `page` 1, `limit` 200. `page` must be 1-100 and `limit`
   * 20-500 — out-of-range values are rejected with 400, not clamped.
   */
  getTrackerEvents(
    params?: TrackerEventsParams,
    options?: RequestOptions
  ): Promise<TrackerEventsResponse> {
    return this.#json<TrackerEventsResponse>("GET", "/api/tracker", {
      query: { page: params?.page, limit: params?.limit },
      signal: options?.signal,
    });
  }

  /** `GET /api/tracker/accounts` — the accounts currently being tracked. */
  listTrackedAccounts(options?: RequestOptions): Promise<TrackedAccountsResponse> {
    return this.#json<TrackedAccountsResponse>("GET", "/api/tracker/accounts", {
      signal: options?.signal,
    });
  }

  /**
   * `POST /api/tracker/accounts` — start tracking an account.
   *
   * Returns the created row. Full-tracking accounts start at
   * `syncStatus: "PENDING"` and flip to `"READY"` once the initial follower and
   * following snapshots land. Private accounts, accounts above the follower
   * ceiling, duplicates and exhausted tier limits are all refused (400 or 403).
   */
  addTrackedAccount(igUsername: string, options?: RequestOptions): Promise<TrackedAccount> {
    return this.#json<TrackedAccount>("POST", "/api/tracker/accounts", {
      body: { igUsername },
      signal: options?.signal,
    });
  }

  /**
   * `DELETE /api/tracker/accounts` — stop tracking an account.
   *
   * `accountId` is the `id` of the tracked account (a cuid), not the Instagram
   * username. Sent as a query parameter, which the handler reads first.
   * Historical activity rows are retained; no new events are detected.
   */
  removeTrackedAccount(
    accountId: string,
    options?: RequestOptions
  ): Promise<RemoveTrackedAccountResponse> {
    return this.#json<RemoveTrackedAccountResponse>("DELETE", "/api/tracker/accounts", {
      query: { accountId },
      signal: options?.signal,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Transport                                                               */
  /* ---------------------------------------------------------------------- */

  async #json<T>(
    method: string,
    path: string,
    init: {
      query?: Record<string, QueryValue>;
      body?: unknown;
      bearer?: boolean;
      signal?: AbortSignal | undefined;
    }
  ): Promise<T> {
    const res = await this.#send(method, path, init);
    const body = await readBody(res);
    return body as T;
  }

  async #send(
    method: string,
    path: string,
    init: {
      query?: Record<string, QueryValue>;
      body?: unknown;
      bearer?: boolean;
      signal?: AbortSignal | undefined;
    }
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}${buildQuery(init.query ?? {})}`;

    const headers: Record<string, string> = {
      "X-Api-Key": this.#apiKey,
      Accept: "application/json",
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    // Only the outbound-analytics handler reads Authorization; sending it more
    // widely would silently switch which credential the server resolves.
    if (init.bearer && this.#bearerToken) {
      headers["Authorization"] = `Bearer ${this.#bearerToken}`;
    }

    const requestInit: RequestInit = { method, headers };
    if (init.body !== undefined) requestInit.body = JSON.stringify(init.body);
    if (init.signal) requestInit.signal = init.signal;

    const res = await this.#fetch(url, requestInit);
    if (!res.ok) {
      const body = await readBody(res);
      throw new StoriesFlyError({
        status: res.status,
        body: (body ?? null) as StoriesFlyError["body"],
        rateLimit: readRateLimit(res.headers, body),
        url,
        method,
      });
    }
    return res;
  }
}

export default StoriesFly;
