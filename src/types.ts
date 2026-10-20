/**
 * Response shapes of StoriesFly API v1.
 *
 * Every shape follows the same rules:
 *
 * - Names are `snake_case`, as on the wire.
 * - A value the answer does not carry is `null`. It is never `0`, `""` or a guess.
 * - Ids are strings. Instagram ids pass 2^53, so a JSON number would round them.
 * - Times are Unix seconds, with an `_iso` twin where one is given.
 * - Links to media are signed Instagram CDN URLs. They expire within days.
 */

/** `reel` is a video published as a Reel. `video` is any other video post. */
export type MediaType = "photo" | "video" | "carousel" | "reel";

/** An account named by id, and by username when the answer knows it. */
export interface UserRef {
  id: string;
  /** Null when only the id was asked for and the answer named nobody. */
  username: string | null;
}

/** An account inside a list or on another object: a follower, a liker, a commenter. */
export interface UserShort {
  id: string;
  username: string | null;
  full_name: string | null;
  profile_pic_url: string | null;
  /** Null when the answer did not say. That is not the same as `false`. */
  verified: boolean | null;
  is_private: boolean | null;
}

/** One image or video: a whole post, or one slide of a carousel. */
export interface MediaItem {
  id: string;
  type: "image" | "video";
  /** The largest rendition. For a video, its cover. */
  image_url: string | null;
  video_url: string | null;
  width: number | null;
  height: number | null;
  /** Seconds. */
  video_duration: number | null;
}

/**
 * One post or reel, in full. The same shape is returned by `post.get`, by `resolve`
 * for a post link, and for every item of a list of posts (`user.posts`, `user.reels`,
 * `hashtag.posts` and the rest).
 */
export interface Post {
  id: string;
  /** The part of the link after `/p/` or `/reel/`. */
  shortcode: string;
  url: string;
  owner: UserRef | null;
  /** Unix seconds. */
  taken_at: number | null;
  taken_at_iso: string | null;
  caption: string | null;
  media_type: MediaType;
  /** Pinned to the top of the profile grid. Pinned posts come first on page one, out of date order. */
  pinned: boolean;
  thumbnail_url: string | null;
  /** One entry for a photo, video or reel. One per slide for a carousel. */
  media: MediaItem[];
  likes: number | null;
  comments: number | null;
  /** Sends to other users. Null when Instagram does not report it. */
  shares: number | null;
  /** Reposts to the reposter's own profile. */
  reposts: number | null;
  /** Plays. Reels and videos only. Null for photos and carousels. */
  views: number | null;
  /** Reels only. Instagram does not report saves for photos or carousels. */
  saves: number | null;
  video_duration: number | null;
  /** The author hid like and view counts, so the numbers above may be absent or partial. */
  counts_hidden: boolean;
}

export interface Story {
  id: string;
  /** Null only when the answer named no owner to build the link from. */
  url: string | null;
  taken_at: number | null;
  taken_at_iso: string | null;
  media_type: "photo" | "video";
  /** The video for a video story, the image for a photo story. */
  media_url: string | null;
  thumbnail_url: string | null;
  video_duration: number | null;
}

/** What `user.profile` returns. The fields of `user.about` are a separate call. */
export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  /** The number of posts. */
  posts: number | null;
  verified: boolean;
  is_private: boolean;
  profile_pic_url: string | null;
  external_url: string | null;
}

/** What `user.about` returns: Instagram's "About this account" panel. */
export interface ProfileAbout {
  id: string;
  username: string | null;
  /** The country the account is based in. Null when Instagram shows none, as is often the case for private accounts. */
  country: string | null;
  /** The month the account joined, as `YYYY-MM`. */
  account_created: string | null;
  /** Null when the panel did not give a readable list. An empty list means the account was never renamed. */
  former_usernames: string[] | null;
}

export interface Highlight {
  /** Digits only. Pass it back as `id`. */
  id: string;
  title: string | null;
  /** The cover as the profile shows it, a square crop. */
  cover_url: string | null;
  items_count: number | null;
  /** Unix seconds. */
  created_at: number | null;
  created_at_iso: string | null;
}

export interface PostComment {
  id: string;
  text: string | null;
  /** Unix seconds. */
  created_at: number | null;
  created_at_iso: string | null;
  user: UserShort;
  likes: number | null;
  /** Null when the answer did not report it. It does not for every comment. */
  replies_count: number | null;
  /** The comment this one answers. Null for a top-level comment. */
  parent_id: string | null;
}

export interface Hashtag {
  id: string;
  /** Without the leading `#`. */
  name: string;
  posts_count: number | null;
  profile_pic_url: string | null;
}

/** An Instagram place. */
export interface Place {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Track {
  /** The id of the audio page. Pass it back as `id`. */
  id: string;
  title: string | null;
  artist: string | null;
  /** Seconds, to the millisecond. */
  duration: number | null;
  cover_url: string | null;
  /** The audio file. A signed link that expires within days. */
  audio_url: string | null;
}

export interface Product {
  id: string;
  name: string | null;
  /** What a buyer pays now, in the major unit of `currency` (60 for "$60.00"). */
  price: number | null;
  /** ISO 4217. Null when the answer gave none. */
  currency: string | null;
  image_url: string | null;
  /** The seller's own page for the product. */
  url: string | null;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

/** The two fields every list carries. */
export interface PageInfo {
  /** Pass back as `cursor` for the next page. Null on the last page. */
  next_cursor: string | null;
  has_more: boolean;
}

/** Posts of an account: `user.posts`, `.reels`, `.tagged`, `.pinned`, `.reposts`. */
export interface UserPostsPage extends PageInfo {
  user: UserRef;
  posts: Post[];
}

export interface UserHighlightsPage extends PageInfo {
  user: UserRef;
  highlights: Highlight[];
}

/** Accounts related to an account: followers, following, their searches, suggestions. */
export interface UsersPage extends PageInfo {
  user: UserRef;
  users: UserShort[];
}

export interface UserStories {
  user: UserRef;
  stories: Story[];
}

export interface PostCommentsPage extends PageInfo {
  post: { id: string };
  comments: PostComment[];
}

export interface CommentRepliesPage extends PageInfo {
  post: { id: string };
  comment: { id: string };
  comments: PostComment[];
}

/** Accounts related to a post: `post.likers` and `post.usertags`. */
export interface PostUsersPage extends PageInfo {
  post: { id: string };
  users: UserShort[];
}

export interface PostMusic {
  post: { id: string };
  /** Null when the post has no music. */
  track: Track | null;
}

export interface CommentLikersPage extends PageInfo {
  comment: { id: string };
  users: UserShort[];
}

export interface StoryResult {
  user: UserRef;
  story: Story;
}

/** A highlight with every story in it. */
export interface HighlightDetail extends Highlight {
  user: UserRef | null;
  stories: Story[];
}

export interface HashtagPostsPage extends PageInfo {
  name: string;
  sort: "top" | "recent" | "reels";
  posts: Post[];
}

export interface LocationPostsPage extends PageInfo {
  location: { id: string };
  sort: "top" | "recent";
  posts: Post[];
}

/** `location.search` and `search.places`. */
export interface PlacesPage extends PageInfo {
  locations: Place[];
}

export interface SearchUsersPage extends PageInfo {
  users: UserShort[];
}

export interface SearchHashtagsPage extends PageInfo {
  hashtags: Hashtag[];
}

export interface SearchMusicPage extends PageInfo {
  tracks: Track[];
}

/** `search.reels` and `search.top`. */
export interface SearchPostsPage extends PageInfo {
  posts: Post[];
}

/** What `resolve` returns. `type` says which kind of thing the link points at. A post link gives the whole `Post`. */
export type Resolved =
  | ({ type: "post" } & Post)
  | ({ type: "story" } & StoryResult)
  | ({ type: "highlight" } & HighlightDetail)
  | ({ type: "user" } & Profile);

export interface ShopCollection {
  /** Pass it back as `collection_id` to `shop.products`. */
  id: string;
  name: string | null;
}

export interface Storefront extends PageInfo {
  merchant: UserRef;
  collections: ShopCollection[];
  /** The first products of the shop. */
  products: Product[];
}

export interface ShopProductsPage extends PageInfo {
  collection: { id: string };
  products: Product[];
}

/** The price levels of an account. Levels above the one open today appear here when they open. */
export type AccountTier = "FREE" | "START" | "GROWTH" | "BUSINESS" | "SCALE";

/** What `account` returns. The call is free. */
export interface Account {
  tier: AccountTier;
  /** The price of one unit, in US dollars. Exact, not rounded to four decimals. */
  unit_price_usd: number;
  balance_usd: number;
  /** Free units left. They are spent before the balance. */
  free_units: number;
  lifetime_topup_usd: number;
  /** The level above yours and what is left to top up to reach it. Null at the top, or when that level is not open yet. */
  next_tier: { tier: AccountTier; remaining_usd: number } | null;
  /** The highest level open today. */
  tier_cap: AccountTier;
  /** Your use of the last 30 days, busiest endpoint first. */
  usage_30d: { endpoint: string; calls: number; spent_usd: number }[];
}

/* -------------------------------------------------------------------------- */
/* Response meta                                                               */
/* -------------------------------------------------------------------------- */

/** What the headers of an answer say about the call. A header the answer did not carry is `null`. */
export interface ResponseMeta {
  /** The HTTP status. */
  status: number;
  /** `X-Request-Id`. Quote it when you write to support about a call. */
  requestId: string | null;
  /** `X-Units-Charged`. 0 when the call was free or was refunded. */
  unitsCharged: number | null;
  /** `X-Balance-Remaining`: US dollars with four decimals, as the API sends it. A string, so no float rounds it. */
  balanceRemaining: string | null;
  /** `X-Free-Units-Remaining`. */
  freeUnitsRemaining: number | null;
  /** `X-RateLimit-Limit`: requests per second your account may send. */
  rateLimitLimit: number | null;
  /** `X-RateLimit-Remaining`: requests left in the current second. */
  rateLimitRemaining: number | null;
}

/** A body with the meta of the call that returned it. */
export interface ApiResult<T> {
  data: T;
  meta: ResponseMeta;
}
