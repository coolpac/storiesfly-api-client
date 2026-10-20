import type {
  CursorParam,
  HashtagSort,
  LinkOrId,
  LocationSearchParams,
  LocationSort,
  PostTarget,
  SearchParams,
  UserTarget,
} from "./params.js";
import type {
  Account,
  ApiResult,
  CommentLikersPage,
  CommentRepliesPage,
  HashtagPostsPage,
  Hashtag,
  HighlightDetail,
  LocationPostsPage,
  Place,
  PlacesPage,
  Post,
  PostMusic,
  PostCommentsPage,
  PostUsersPage,
  Profile,
  ProfileAbout,
  Resolved,
  SearchHashtagsPage,
  SearchMusicPage,
  SearchPostsPage,
  SearchUsersPage,
  ShopProductsPage,
  Storefront,
  StoryResult,
  Track,
  UserHighlightsPage,
  UserPostsPage,
  UserStories,
  UsersPage,
} from "./types.js";

/** Options of one call. */
export interface CallOptions {
  /** Aborts the call, and any wait before a retry. */
  signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this call. 0 turns the timeout off. */
  timeoutMs?: number;
  /** Overrides the client's `maxRetries` for this call. */
  maxRetries?: number;
}

/** Pass `{ withMeta: true }` to get the body together with the headers of the call. */
export type PlainOptions = CallOptions & { withMeta?: false };
export type MetaOptions = CallOptions & { withMeta: true };

/**
 * A call with parameters. It resolves to the body. With `{ withMeta: true }` it
 * resolves to `{ data, meta }` instead.
 */
export interface Endpoint<P, R> {
  (params: P, options: MetaOptions): Promise<ApiResult<R>>;
  (params: P, options?: PlainOptions): Promise<R>;
}

/** A call without parameters: `client.account()`. */
export interface EndpointWithoutParams<R> {
  (options: MetaOptions): Promise<ApiResult<R>>;
  (options?: PlainOptions): Promise<R>;
}

/** A list call: its parameters take a `cursor`. */
export type PagedEndpoint<P extends CursorParam, R> = Endpoint<P, R>;

type Cur<P> = P & CursorParam;

export interface UserResource {
  /** The public profile: name, bio, link, follower, following and post counts, verified and private flags. 1 unit. */
  profile: Endpoint<UserTarget, Profile>;
  /** Instagram's "About this account" panel: country, join month, former usernames. 1 unit. */
  about: Endpoint<UserTarget, ProfileAbout>;
  /** Posts and reels, newest first, up to 9 to a page, with likes, comments, views, shares, saves and reposts. 1 unit a page. */
  posts: Endpoint<Cur<UserTarget>, UserPostsPage>;
  /** Reels, newest first, with caption, video and counts. 1 unit a page. */
  reels: Endpoint<Cur<UserTarget>, UserPostsPage>;
  /** Posts other accounts tagged this account in. 1 unit a page. */
  tagged: Endpoint<Cur<UserTarget>, UserPostsPage>;
  /** The posts pinned to the top of the profile, in pinned order. 1 unit. */
  pinned: Endpoint<UserTarget, UserPostsPage>;
  /** The stories up right now. Empty when there are none. 1 unit. */
  stories: Endpoint<UserTarget, UserStories>;
  /** Highlight ids, titles and covers. Use `highlight.get` for the stories inside one. 1 unit a page. */
  highlights: Endpoint<Cur<UserTarget>, UserHighlightsPage>;
  /** Followers, up to 25 to a page. 1 unit a page. */
  followers: Endpoint<Cur<UserTarget>, UsersPage>;
  /** Accounts followed, up to 25 to a page. 1 unit a page. */
  following: Endpoint<Cur<UserTarget>, UsersPage>;
  /** Searches the followers by name or username. 1 unit. */
  followersSearch: Endpoint<UserTarget & SearchParams, UsersPage>;
  /** Searches the accounts followed by name or username. 1 unit. */
  followingSearch: Endpoint<UserTarget & SearchParams, UsersPage>;
  /** Posts and reels the account reposted. 1 unit a page. */
  reposts: Endpoint<Cur<UserTarget>, UserPostsPage>;
  /** Accounts Instagram suggests to people who view this account. 1 unit. */
  suggested: Endpoint<UserTarget, UsersPage>;
}

export interface PostResource {
  /** One post or reel in full: links to its pictures and video (one entry in `media` per slide), caption, owner, time, and the numbers. 1 unit. */
  get: Endpoint<PostTarget, Post>;
  /** The comments on a post. 1 unit a page. */
  comments: Endpoint<Cur<PostTarget>, PostCommentsPage>;
  /** The replies to one comment. Name the post, and the comment with `comment_id`. 1 unit a page. */
  commentReplies: Endpoint<Cur<PostTarget> & { comment_id: string }, CommentRepliesPage>;
  /** Accounts that liked the post. Instagram shows a sample of a busy post's likers, and so does this. 1 unit. */
  likers: Endpoint<PostTarget, PostUsersPage>;
  /** Accounts tagged in the post's photos or video. 1 unit. */
  usertags: Endpoint<PostTarget, PostUsersPage>;
  /** The track used in a reel. `track` is null when the post has no music. 1 unit. */
  music: Endpoint<PostTarget, PostMusic>;
}

export interface CommentResource {
  /** Accounts that liked a comment. 1 unit a page. */
  likers: Endpoint<Cur<{ comment_id: string }>, CommentLikersPage>;
}

export interface StoryResource {
  /** One story by link or id. It exists only while it is up. 1 unit. */
  get: Endpoint<LinkOrId, StoryResult>;
}

export interface HighlightResource {
  /** One highlight by link or id, with every story in it. 1 unit. */
  get: Endpoint<LinkOrId, HighlightDetail>;
}

export interface HashtagResource {
  /** A hashtag's id, name and post count. `name` may carry the `#`. 1 unit. */
  get: Endpoint<{ name: string }, Hashtag>;
  /** Posts under a hashtag. Keep `sort` the same from page to page. 1 unit a page. */
  posts: Endpoint<Cur<{ name: string; sort?: HashtagSort }>, HashtagPostsPage>;
}

export interface LocationResource {
  /** A place's name, address, city and coordinates. 1 unit. */
  get: Endpoint<{ id: string }, Place>;
  /** Posts tagged at a place. Keep `sort` the same from page to page. 1 unit a page. */
  posts: Endpoint<Cur<{ id: string; sort?: LocationSort }>, LocationPostsPage>;
  /** Places by name (`q`), or around a point (`lat` and `lng`). 1 unit. */
  search: Endpoint<LocationSearchParams, PlacesPage>;
}

export interface SearchResource {
  /** Accounts by name or username. 1 unit a page. */
  users: Endpoint<Cur<SearchParams>, SearchUsersPage>;
  /** Hashtags that match a text, with their post counts. 1 unit a page. */
  hashtags: Endpoint<Cur<SearchParams>, SearchHashtagsPage>;
  /** Places by name. 1 unit. */
  places: Endpoint<SearchParams, PlacesPage>;
  /** Audio tracks by title or artist. 1 unit a page. */
  music: Endpoint<Cur<SearchParams>, SearchMusicPage>;
  /** Reels for a text. 1 unit a page. */
  reels: Endpoint<Cur<SearchParams>, SearchPostsPage>;
  /** The top posts Instagram shows for a text. 1 unit a page. */
  top: Endpoint<Cur<SearchParams>, SearchPostsPage>;
}

export interface TrackResource {
  /** One audio track by the id of its audio page. 1 unit. */
  get: Endpoint<{ id: string }, Track>;
}

export interface ShopResource {
  /** An account's Instagram shop: its collections and the first products. 1 unit. */
  storefront: Endpoint<UserTarget, Storefront>;
  /** The products of one shop collection (`collection_id` from `storefront`). 1 unit a page. */
  products: Endpoint<Cur<{ collection_id: string }>, ShopProductsPage>;
}

/** `client.resolve`: turns an Instagram link into the thing it points at. A post link gives the whole post, as `post.get` does. 1 unit, or 2 for a share link. */
export type ResolveCall = Endpoint<{ url: string }, Resolved>;

/** `client.account`: plan, price of a unit, balance, free units, and the use of the last 30 days. Free. */
export type AccountCall = EndpointWithoutParams<Account>;
