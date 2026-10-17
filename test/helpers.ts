import { StoriesFly, type FetchInit, type FetchLike } from "../src/index.js";

export interface Reply {
  status?: number;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as is, instead of `body`. */
  text?: string;
  headers?: Record<string, string>;
  /** `fetch` rejects with this. */
  fail?: Error;
  /** The answer never comes. `fetch` rejects when the client aborts. */
  hang?: boolean;
}

export interface Call {
  url: string;
  init: FetchInit;
}

/**
 * A `fetch` that records every call and replays the replies in order. The last
 * reply repeats when the queue runs out.
 */
export function stubFetch(...replies: Reply[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];

  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const reply = (queue.length > 1 ? queue.shift() : queue[0]) ?? { body: {} };

    if (reply.fail) return Promise.reject(reply.fail);
    if (reply.hang) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason ?? new Error("aborted")), { once: true });
      });
    }
    const headers: Record<string, string> = { ...(reply.headers ?? {}) };
    if (reply.text !== undefined) {
      return Promise.resolve(new Response(reply.text, { status: reply.status ?? 200, headers }));
    }
    headers["content-type"] = "application/json";
    return Promise.resolve(new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers }));
  };

  return { fetch, calls };
}

export function makeClient(fetch: FetchLike, extra: { baseUrl?: string; timeoutMs?: number; maxRetries?: number } = {}): StoriesFly {
  return new StoriesFly({ apiKey: "sf_test_key", fetch, ...extra });
}

/** A list page that goes on or ends. */
export function page(items: string[], next: string | null): { users: { id: string }[]; next_cursor: string | null; has_more: boolean } {
  return { users: items.map((id) => ({ id })), next_cursor: next, has_more: next !== null };
}

/** Finds `client.user.profile` from "user.profile", or `client.account` from "account". */
export function methodOf(client: StoriesFly, name: string): (...args: unknown[]) => Promise<unknown> {
  let target: unknown = client;
  for (const part of name.split(".")) {
    target = (target as Record<string, unknown>)[part];
  }
  if (typeof target !== "function") throw new Error(`client has no method ${name}`);
  return target as (...args: unknown[]) => Promise<unknown>;
}
