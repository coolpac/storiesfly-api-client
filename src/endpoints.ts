/**
 * The method table: every call of the client, and the endpoint of API v1 it makes.
 *
 * `openapi.json` lists the same endpoints. A test holds the two together, so a
 * path in the spec without a method here (or the other way round) fails the build.
 */

export interface EndpointInfo {
  /** The call, as written on the client: `user.profile` is `client.user.profile()`. */
  readonly method: string;
  /** The path under the base URL. */
  readonly path: string;
  /** True when the call takes `cursor` and returns `next_cursor`, so `client.paginate` can follow it. */
  readonly paged: boolean;
}

export const ENDPOINTS = [
  { method: "user.profile", path: "/user/profile", paged: false },
  { method: "user.about", path: "/user/about", paged: false },
  { method: "user.posts", path: "/user/posts", paged: true },
  { method: "user.reels", path: "/user/reels", paged: true },
  { method: "user.tagged", path: "/user/tagged", paged: true },
  { method: "user.pinned", path: "/user/pinned", paged: false },
  { method: "user.stories", path: "/user/stories", paged: false },
  { method: "user.highlights", path: "/user/highlights", paged: true },
  { method: "user.followers", path: "/user/followers", paged: true },
  { method: "user.following", path: "/user/following", paged: true },
  { method: "user.followersSearch", path: "/user/followers/search", paged: false },
  { method: "user.followingSearch", path: "/user/following/search", paged: false },
  { method: "user.reposts", path: "/user/reposts", paged: true },
  { method: "user.suggested", path: "/user/suggested", paged: false },
  { method: "post.get", path: "/post", paged: false },
  { method: "post.comments", path: "/post/comments", paged: true },
  { method: "post.commentReplies", path: "/post/comment-replies", paged: true },
  { method: "post.likers", path: "/post/likers", paged: false },
  { method: "post.usertags", path: "/post/usertags", paged: false },
  { method: "post.music", path: "/post/music", paged: false },
  { method: "comment.likers", path: "/comment/likers", paged: true },
  { method: "story.get", path: "/story", paged: false },
  { method: "highlight.get", path: "/highlight", paged: false },
  { method: "hashtag.get", path: "/hashtag", paged: false },
  { method: "hashtag.posts", path: "/hashtag/posts", paged: true },
  { method: "location.get", path: "/location", paged: false },
  { method: "location.posts", path: "/location/posts", paged: true },
  { method: "location.search", path: "/location/search", paged: false },
  { method: "search.users", path: "/search/users", paged: true },
  { method: "search.hashtags", path: "/search/hashtags", paged: true },
  { method: "search.places", path: "/search/places", paged: false },
  { method: "search.music", path: "/search/music", paged: true },
  { method: "search.reels", path: "/search/reels", paged: true },
  { method: "search.top", path: "/search/top", paged: true },
  { method: "track.get", path: "/track", paged: false },
  { method: "resolve", path: "/resolve", paged: false },
  { method: "shop.storefront", path: "/shop/storefront", paged: false },
  { method: "shop.products", path: "/shop/products", paged: true },
  { method: "tiktok.video", path: "/tiktok/video", paged: false },
  { method: "tiktok.user.profile", path: "/tiktok/user/profile", paged: false },
  { method: "tiktok.user.videos", path: "/tiktok/user/videos", paged: true },
  { method: "tiktok.user.stories", path: "/tiktok/user/stories", paged: false },
  { method: "tiktok.user.followers", path: "/tiktok/user/followers", paged: true },
  { method: "tiktok.user.following", path: "/tiktok/user/following", paged: true },
  { method: "tiktok.user.reposts", path: "/tiktok/user/reposts", paged: true },
  { method: "download", path: "/download", paged: false },
  { method: "account", path: "/account", paged: false },
] as const satisfies readonly EndpointInfo[];

export type MethodName = (typeof ENDPOINTS)[number]["method"];

const PATHS = new Map<string, string>(ENDPOINTS.map((e) => [e.method, e.path]));

/** The path of a method. */
export function pathOf(method: MethodName): string {
  const path = PATHS.get(method);
  if (path === undefined) throw new Error(`StoriesFly: no endpoint for ${method}`);
  return path;
}
