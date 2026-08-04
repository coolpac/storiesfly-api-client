import type { ApiErrorBody, RateLimitInfo } from "./types.js";

/**
 * Thrown for every non-2xx response.
 *
 * `body` is the parsed JSON error body when the server sent one (all StoriesFly
 * error responses are JSON), the raw text when it did not, and `null` when the
 * response had no body at all. `rateLimit` carries whatever the handler put in
 * headers — populated on 429, and on any response that sets `X-RateLimit-*`.
 */
export class StoriesFlyError extends Error {
  /** HTTP status code. */
  readonly status: number;
  /** Parsed `{ error, ... }` body, raw text, or null. */
  readonly body: ApiErrorBody | string | null;
  /** Rate-limit headers, when the handler set any. */
  readonly rateLimit: RateLimitInfo;
  /** Request URL that produced the error. */
  readonly url: string;
  /** HTTP method of the failed request. */
  readonly method: string;

  constructor(init: {
    status: number;
    body: ApiErrorBody | string | null;
    rateLimit?: RateLimitInfo;
    url: string;
    method: string;
  }) {
    super(messageFor(init.status, init.body));
    this.name = "StoriesFlyError";
    this.status = init.status;
    this.body = init.body;
    this.rateLimit = init.rateLimit ?? {};
    this.url = init.url;
    this.method = init.method;
  }

  /** True when the request was rejected for quota or burst reasons. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * Seconds to wait before retrying, when the server said. Reads the
   * `Retry-After` header first, then `retryAfterSec` in the body.
   */
  get retryAfterSec(): number | undefined {
    if (this.rateLimit.retryAfterSec !== undefined) return this.rateLimit.retryAfterSec;
    if (typeof this.body === "object" && this.body !== null) {
      const v = this.body.retryAfterSec;
      if (typeof v === "number") return v;
    }
    return undefined;
  }

  /** True when the server suggested a plan upgrade would fix this. */
  get requiresUpgrade(): boolean {
    return typeof this.body === "object" && this.body !== null && this.body.upgrade === true;
  }
}

function messageFor(status: number, body: ApiErrorBody | string | null): string {
  if (typeof body === "object" && body !== null && typeof body.error === "string") {
    return `StoriesFly API ${status}: ${body.error}`;
  }
  if (typeof body === "string" && body.trim() !== "") {
    return `StoriesFly API ${status}: ${body.slice(0, 200)}`;
  }
  return `StoriesFly API ${status}`;
}
