// Print the numbers of one post or reel: views, likes, comments, shares, saves, reposts.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=your_key node examples/post-metrics.mjs https://www.instagram.com/p/DcyLOLIEdy7/
//
// Any post, reel or IGTV link works. A number Instagram does not report for this kind of
// post (views on a photo, saves on a carousel) is null in the answer, and shows as "n/a" here.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
const url = process.argv[2];
if (!apiKey || !url) {
  console.error("Usage: STORIESFLY_API_KEY=your_key node examples/post-metrics.mjs <post link>");
  console.error("Get a key at https://storiesfly.com/developers/dashboard");
  process.exit(1);
}

const client = new StoriesFly({ apiKey, baseUrl: process.env.STORIESFLY_BASE_URL });
const show = (n) => (n === null ? "n/a" : n.toLocaleString("en-US"));

try {
  const post = await client.post.get({ url });
  console.log(`${post.url}  ${post.media_type}  by @${post.owner?.username ?? post.owner?.id ?? "unknown"}  ${post.taken_at_iso ?? ""}`);
  for (const field of ["views", "likes", "comments", "shares", "saves", "reposts"]) {
    console.log(`  ${field.padEnd(8)} ${show(post[field])}`);
  }
  if (post.counts_hidden) console.log("  The author hid like and view counts, so these numbers may be partial.");
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(`${err.code} (HTTP ${err.status}): ${err.message}`);
  process.exit(1);
}
