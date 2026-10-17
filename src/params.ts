/**
 * Parameters of the calls. The names are the query parameters of the API.
 *
 * Where the API says "send exactly one of", the type allows exactly one, so a
 * call that sends none or two does not compile.
 */

/** The account a call is about: its username (a leading `@` is ignored) or its numeric Instagram id. */
export type UserTarget =
  | { username: string; id?: never }
  | { id: string; username?: never };

/** The post a call is about: its link, its shortcode (the part after `/p/` or `/reel/`) or its numeric media id. */
export type PostTarget =
  | { url: string; code?: never; id?: never }
  | { code: string; url?: never; id?: never }
  | { id: string; url?: never; code?: never };

/** A story or a highlight: its link or its numeric id. */
export type LinkOrId =
  | { url: string; id?: never }
  | { id: string; url?: never };

/** Added to every call that returns a list that goes on. */
export interface CursorParam {
  /** The `next_cursor` of the page before. Leave it out for the first page. */
  cursor?: string;
}

/** Which posts of a hashtag: the top ones (the default), the newest, or reels. */
export type HashtagSort = "top" | "recent" | "reels";

/** Which posts of a place: the top ones (the default) or the newest. */
export type LocationSort = "top" | "recent";

/** Text to search for, 1 to 100 characters. */
export interface SearchParams {
  q: string;
}

/** Latitude and longitude may be numbers or strings. */
export type Coordinate = number | string;

/** `location.search`: a place name, or a point. */
export type LocationSearchParams =
  | { q: string; lat?: never; lng?: never }
  | { lat: Coordinate; lng: Coordinate; q?: never };
