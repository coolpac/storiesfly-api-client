import { pathOf, type MethodName } from "./endpoints.js";
import { StoriesFlyError, isApiErrorCode } from "./errors.js";
import type { CursorParam } from "./params.js";
import type {
  AccountCall,
  CommentResource,
  Endpoint,
  HashtagResource,
  HighlightResource,
  LocationResource,
  MetaOptions,
  PlainOptions,
  PostResource,
  ResolveCall,
  SearchResource,
  ShopResource,
  TikTokResource,
  DownloadCall,
  StoryResource,
  TrackResource,
  UserResource,
} from "./resources.js";
import type { ApiResult, PageInfo, ResponseMeta } from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://storiesfly.com/api/v1";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

/** A `Retry-After` longer than this is not waited out: the call fails at once, with `retryAfterMs` set. */
export const MAX_RETRY_WAIT_MS = 30_000;

/** Headers of a response, as far as the client reads them. */
export interface HeadersLike {
  get(name: string): string | null;
}

/** What the client needs of a `Response`. The global one fits. */
export interface FetchResponseLike {
  status: number;
  headers: HeadersLike;
  text(): Promise<string>;
}

/** What the client passes to `fetch`. */
export interface FetchInit {
  method: "GET";
  headers: Record<string, string>;
  signal: AbortSignal;
}

/** The `fetch` the client calls. The global `fetch` fits. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

export interface StoriesFlyOptions {
  /** Your API key, sent as `X-Api-Key`. Make one at https://storiesfly.com/developers/dashboard */
  apiKey: string;
  /** Defaults to `https://storiesfly.com/api/v1`. Trailing slashes are ignored. */
  baseUrl?: string | undefined;
  /** Your own `fetch`, for a proxy or a test. Defaults to the global `fetch`. */
  fetch?: FetchLike | undefined;
  /** How long one attempt may take, in milliseconds. Default 60000. 0 turns the timeout off. */
  timeoutMs?: number | undefined;
  /** How many times a `rate_limited` answer is retried. Default 2. 0 turns retries off. */
  maxRetries?: number | undefined;
}

export interface PaginateOptions {
  /** Stop after this many pages. Each page is one call and is charged as one. Default: follow the list to its end. */
  maxPages?: number;
  /** Aborts the walk. */
  signal?: AbortSignal;
  /** Yield `{ data, meta }` for each page instead of the page. */
  withMeta?: boolean;
}

type Raw = { status: number; headers: HeadersLike; text: string };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type QueryValue = string | number | boolean | bigint | undefined | null;

/**
 * Builds the query string: values that are `undefined` or `null` are left out, the
 * rest are percent-encoded (a space is `%20`). Returns `""` when nothing is left.
 */
export function buildQuery(params: object | undefined): string {
  if (params === undefined) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
      throw new TypeError(`StoriesFly: parameter \`${key}\` must be a string, number or boolean`);
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/** `Retry-After` in milliseconds. It is a number of seconds, or an HTTP date. */
export function parseRetryAfter(raw: string | null, now: number = Date.now()): number | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

function numberHeader(headers: HeadersLike, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readMeta(status: number, headers: HeadersLike): ResponseMeta {
  return {
    status,
    requestId: headers.get("x-request-id"),
    unitsCharged: numberHeader(headers, "x-units-charged"),
    balanceRemaining: headers.get("x-balance-remaining"),
    freeUnitsRemaining: numberHeader(headers, "x-free-units-remaining"),
    rateLimitLimit: numberHeader(headers, "x-ratelimit-limit"),
    rateLimitRemaining: numberHeader(headers, "x-ratelimit-remaining"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat === "" ? "" : `: ${flat.slice(0, 200)}`;
}

function errorFromResponse(raw: Raw, url: string): StoriesFlyError {
  const meta = readMeta(raw.status, raw.headers);
  const common = {
    status: raw.status,
    url,
    requestId: meta.requestId,
    retryAfterMs: parseRetryAfter(raw.headers.get("retry-after")),
    meta,
  };
  const parsed = tryParse(raw.text);
  const body = parsed.ok && isRecord(parsed.value) ? parsed.value : undefined;
  const code = body?.code;
  if (body && isApiErrorCode(code)) {
    const sentence = typeof body.error === "string" && body.error !== "" ? body.error : code;
    const fields = Array.isArray(body.fields) ? body.fields.filter((f): f is string => typeof f === "string") : null;
    return new StoriesFlyError({
      ...common,
      code,
      message: `StoriesFly API ${raw.status} ${code}: ${sentence}`,
      fields,
      linkUrl: typeof body.link_url === "string" ? body.link_url : null,
      body,
    });
  }
  return new StoriesFlyError({
    ...common,
    code: "invalid_response",
    message: `StoriesFly API ${raw.status}: the answer is not a StoriesFly error${snippet(raw.text)}`,
    body: parsed.ok ? parsed.value : raw.text,
  });
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Client for the StoriesFly API.
 *
 * ```ts
 * import { StoriesFly } from "storiesfly";
 *
 * const client = new StoriesFly({ apiKey: process.env.STORIESFLY_API_KEY! });
 * const { stories } = await client.user.stories({ username: "instagram" });
 * ```
 *
 * Every call resolves to the parsed body. Pass `{ withMeta: true }` as the last
 * argument to get `{ data, meta }`, where `meta` holds the billing headers.
 */
export class StoriesFly {
  readonly baseUrl: string;

  readonly user: UserResource;
  readonly post: PostResource;
  readonly comment: CommentResource;
  readonly story: StoryResource;
  readonly highlight: HighlightResource;
  readonly hashtag: HashtagResource;
  readonly location: LocationResource;
  readonly search: SearchResource;
  readonly track: TrackResource;
  readonly shop: ShopResource;
  readonly tiktok: TikTokResource;
  readonly download: DownloadCall;
  readonly resolve: ResolveCall;
  readonly account: AccountCall;

  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;

  constructor(options: StoriesFlyOptions) {
    const apiKey = typeof options?.apiKey === "string" ? options.apiKey.trim() : "";
    if (apiKey === "") {
      throw new TypeError("StoriesFly: `apiKey` is required");
    }
    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new TypeError("StoriesFly: `timeoutMs` must be a number of milliseconds, 0 or more");
    }
    this.#timeoutMs = timeoutMs;

    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new TypeError("StoriesFly: `maxRetries` must be a whole number, 0 or more");
    }
    this.#maxRetries = maxRetries;

    if (options.fetch) {
      this.#fetch = options.fetch;
    } else if (typeof globalThis.fetch === "function") {
      this.#fetch = globalThis.fetch.bind(globalThis) as unknown as FetchLike;
    } else {
      throw new TypeError("StoriesFly: no global `fetch` (Node 18 or newer is required). Pass `fetch` in the options.");
    }

    // Every method is made from the table in endpoints.ts, so a path is written once.
    const e = (method: MethodName) => this.#endpoint(method);
    this.user = {
      profile: e("user.profile"),
      about: e("user.about"),
      posts: e("user.posts"),
      reels: e("user.reels"),
      tagged: e("user.tagged"),
      pinned: e("user.pinned"),
      stories: e("user.stories"),
      highlights: e("user.highlights"),
      followers: e("user.followers"),
      following: e("user.following"),
      followersSearch: e("user.followersSearch"),
      followingSearch: e("user.followingSearch"),
      reposts: e("user.reposts"),
      suggested: e("user.suggested"),
    };
    this.post = {
      get: e("post.get"),
      comments: e("post.comments"),
      commentReplies: e("post.commentReplies"),
      likers: e("post.likers"),
      usertags: e("post.usertags"),
      music: e("post.music"),
    };
    this.comment = { likers: e("comment.likers") };
    this.story = { get: e("story.get") };
    this.highlight = { get: e("highlight.get") };
    this.hashtag = { get: e("hashtag.get"), posts: e("hashtag.posts") };
    this.location = { get: e("location.get"), posts: e("location.posts"), search: e("location.search") };
    this.search = {
      users: e("search.users"),
      hashtags: e("search.hashtags"),
      places: e("search.places"),
      music: e("search.music"),
      reels: e("search.reels"),
      top: e("search.top"),
    };
    this.track = { get: e("track.get") };
    this.shop = { storefront: e("shop.storefront"), products: e("shop.products") };
    this.tiktok = {
      video: e("tiktok.video"),
      user: {
        profile: e("tiktok.user.profile"),
        videos: e("tiktok.user.videos"),
        stories: e("tiktok.user.stories"),
        followers: e("tiktok.user.followers"),
        following: e("tiktok.user.following"),
        reposts: e("tiktok.user.reposts"),
      },
    };
    this.download = e("download");
    this.resolve = e("resolve");

    const accountPath = pathOf("account");
    this.account = ((options?: PlainOptions | MetaOptions) => this.#send(accountPath, undefined, options)) as AccountCall;
  }

  /**
   * Walks a list page by page: calls `method` with `params`, yields the page, then
   * calls it again with the `next_cursor` of the page before, until `has_more` is
   * `false`.
   *
   * ```ts
   * for await (const page of client.paginate(client.user.followers, { username: "instagram" }, { maxPages: 4 })) {
   *   for (const user of page.users) console.log(user.username);
   * }
   * ```
   *
   * Every page is one call and is charged as one. Set `maxPages` when you do not
   * want to follow a long list to its end. `params.cursor` starts the walk
   * from a page you already have.
   */
  paginate<P extends CursorParam, R extends PageInfo>(
    method: Endpoint<P, R>,
    params: P,
    options?: PaginateOptions & { withMeta?: false },
  ): AsyncGenerator<R, void, undefined>;
  paginate<P extends CursorParam, R extends PageInfo>(
    method: Endpoint<P, R>,
    params: P,
    options: PaginateOptions & { withMeta: true },
  ): AsyncGenerator<ApiResult<R>, void, undefined>;
  async *paginate<P extends CursorParam, R extends PageInfo>(
    method: Endpoint<P, R>,
    params: P,
    options: PaginateOptions = {},
  ): AsyncGenerator<R | ApiResult<R>, void, undefined> {
    const maxPages = options.maxPages ?? Infinity;
    if (maxPages !== Infinity && (!Number.isInteger(maxPages) || maxPages < 1)) {
      throw new TypeError("StoriesFly: `maxPages` must be a whole number, 1 or more");
    }
    const callOptions: MetaOptions = options.signal ? { withMeta: true, signal: options.signal } : { withMeta: true };

    const seen = new Set<string>();
    let cursor = params.cursor;
    if (cursor) seen.add(cursor);

    for (let page = 0; page < maxPages; page++) {
      const next: P = cursor === undefined ? params : { ...params, cursor };
      const result = await method(next, callOptions);
      yield options.withMeta ? result : result.data;

      const after = result.data.next_cursor;
      // A list that says it ends, has no next page, or points back at a page already read, ends here.
      if (!result.data.has_more || !after || seen.has(after)) return;
      seen.add(after);
      cursor = after;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Transport                                                                 */
  /* ------------------------------------------------------------------------ */

  // The resource interfaces (resources.ts) give each method its types; here the call is untyped.
  #endpoint(method: MethodName): Endpoint<any, any> {
    const path = pathOf(method);
    const call = (params: object | undefined, options?: PlainOptions | MetaOptions) => this.#send(path, params, options);
    return call as Endpoint<any, any>;
  }

  async #send(path: string, params: object | undefined, options: PlainOptions | MetaOptions | undefined): Promise<unknown> {
    const url = `${this.baseUrl}${path}${buildQuery(params)}`;
    const maxRetries = options?.maxRetries ?? this.#maxRetries;
    const timeoutMs = options?.timeoutMs ?? this.#timeoutMs;
    const signal = options?.signal;

    for (let attempt = 0; ; attempt++) {
      const raw = await this.#attempt(url, timeoutMs, signal);

      if (raw.status >= 200 && raw.status < 300) {
        const parsed = tryParse(raw.text);
        const meta = readMeta(raw.status, raw.headers);
        if (!parsed.ok) {
          throw new StoriesFlyError({
            status: raw.status,
            code: "invalid_response",
            message: `StoriesFly API ${raw.status}: the answer is not JSON${snippet(raw.text)}`,
            url,
            requestId: meta.requestId,
            meta,
            body: raw.text,
          });
        }
        return options?.withMeta === true ? ({ data: parsed.value, meta } satisfies ApiResult<unknown>) : parsed.value;
      }

      const error = errorFromResponse(raw, url);
      // Only a rate limit is retried. A 402 (no credits) is never retried: another call would not change it.
      if (raw.status === 429 && attempt < maxRetries) {
        const wait = error.retryAfterMs ?? Math.min(500 * 2 ** attempt, 8_000);
        if (wait <= MAX_RETRY_WAIT_MS) {
          await sleep(wait, signal);
          continue;
        }
      }
      throw error;
    }
  }

  /** One request, from the call to the end of the body, inside the timeout. */
  async #attempt(url: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<Raw> {
    if (signal?.aborted) throw signal.reason;

    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

    try {
      const res = await this.#fetch(url, {
        method: "GET",
        headers: {
          "X-Api-Key": this.#apiKey,
          Accept: "application/json",
          "User-Agent": `storiesfly-js/${VERSION}`,
        },
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, headers: res.headers, text };
    } catch (cause) {
      if (timedOut) {
        throw new StoriesFlyError({
          status: 0,
          code: "timeout",
          message: `StoriesFly: no answer within ${timeoutMs} ms`,
          url,
          cause,
        });
      }
      // The caller aborted: hand back their own reason, as `fetch` does.
      if (signal?.aborted) throw signal.reason;
      throw new StoriesFlyError({
        status: 0,
        code: "network_error",
        message: `StoriesFly: the request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        url,
        cause,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
