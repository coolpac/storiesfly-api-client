import type { ResponseMeta } from "./types.js";

/** The codes the API sends in the `code` field of an error body. */
export const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "telegram_required",
  "private_account",
  "not_found",
  "unknown_endpoint",
  "rate_limited",
  "credits_exhausted",
  "upstream_unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Codes the client itself sets, when there is no usable answer from the API.
 *
 * - `timeout`: the call took longer than `timeoutMs`.
 * - `network_error`: `fetch` failed before an answer came (DNS, connection, TLS).
 * - `invalid_response`: an answer came, but not in the documented shape. A proxy's
 *   error page is one. The `status` and the text of the body are kept.
 */
export type ClientErrorCode = "timeout" | "network_error" | "invalid_response";

export type StoriesFlyErrorCode = ApiErrorCode | ClientErrorCode;

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

export interface StoriesFlyErrorInit {
  status: number;
  code: StoriesFlyErrorCode;
  /** The sentence the API sent, or the client's own for a failure it found. */
  message: string;
  url: string;
  requestId?: string | null;
  retryAfterMs?: number | null;
  fields?: readonly string[] | null;
  linkUrl?: string | null;
  meta?: ResponseMeta | null;
  body?: unknown;
  cause?: unknown;
}

/**
 * Thrown for every call that does not return data.
 *
 * Test `code`, not `message`. The codes are the API's, plus three the client sets
 * itself (see `ClientErrorCode`).
 *
 * ```ts
 * try {
 *   await client.user.stories({ username: "instagram" });
 * } catch (err) {
 *   if (err instanceof StoriesFlyError && err.code === "private_account") {
 *     // charged: the call reached a private account
 *   } else throw err;
 * }
 * ```
 */
export class StoriesFlyError extends Error {
  /** The HTTP status. 0 when no answer came (`timeout`, `network_error`). */
  readonly status: number;
  /** What went wrong, in a value to test for. */
  readonly code: StoriesFlyErrorCode;
  /** `X-Request-Id` of the call. Quote it when you write to support. Null when no answer came. */
  readonly requestId: string | null;
  /** How long the API asked you to wait, from `Retry-After`. Set on `rate_limited` and, mostly, `upstream_unavailable`. */
  readonly retryAfterMs: number | null;
  /** With `bad_request`: the names of the parameters that were refused. */
  readonly fields: readonly string[] | null;
  /** With `telegram_required`: the Telegram link that links the account. */
  readonly linkUrl: string | null;
  /** The billing headers of the failed call. `meta.unitsCharged` says whether it was charged. Null when no answer came. */
  readonly meta: ResponseMeta | null;
  /** The full URL that was called. It holds no key. */
  readonly url: string;
  /** The parsed error body, the text of the body when it was not JSON, or null. */
  readonly body: unknown;

  constructor(init: StoriesFlyErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "StoriesFlyError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.fields = init.fields ?? null;
    this.linkUrl = init.linkUrl ?? null;
    this.meta = init.meta ?? null;
    this.url = init.url;
    this.body = init.body ?? null;
  }
}
