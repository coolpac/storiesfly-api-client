// Print one post or reel: its caption, the links to its pictures and video, and the numbers.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=your_key node examples/post.mjs https://www.instagram.com/p/DcyLOLIEdy7/
//
// Any post, reel or IGTV link works. `media` has one entry for a photo, a video or a reel, and
// one per slide for a carousel. A number Instagram does not report for this kind of post (views
// on a photo, saves on a carousel) is null in the answer, and shows as "n/a" here.
// The links are signed Instagram CDN links that expire within days: download what you need soon.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
const url = process.argv[2];
if (!apiKey || !url) {
  console.error("Usage: STORIESFLY_API_KEY=your_key node examples/post.mjs <post link>");
  console.error("Get a key at https://storiesfly.com/developers/dashboard");
  process.exit(1);
}

const client = new StoriesFly({ apiKey, baseUrl: process.env.STORIESFLY_BASE_URL });
const show = (n) => (n === null ? "n/a" : n.toLocaleString("en-US"));

try {
  const post = await client.post.get({ url });
  console.log(`${post.url}  ${post.media_type}  by @${post.owner?.username ?? post.owner?.id ?? "unknown"}  ${post.taken_at_iso ?? ""}`);
  if (post.caption) console.log(`\n${post.caption}\n`);

  post.media.forEach((item, i) => {
    const size = item.width !== null && item.height !== null ? `${item.width}x${item.height}` : "size unknown";
    console.log(`  ${i + 1}. ${item.type} ${size}`);
    console.log(`     image  ${item.image_url ?? "n/a"}`);
    if (item.video_url !== null) console.log(`     video  ${item.video_url}`);
  });

  console.log();
  for (const field of ["views", "likes", "comments", "shares", "saves", "reposts"]) {
    console.log(`  ${field.padEnd(8)} ${show(post[field])}`);
  }
  if (post.counts_hidden) console.log("  The author hid like and view counts, so these numbers may be partial.");
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(`${err.code} (HTTP ${err.status}): ${err.message}`);
  process.exit(1);
}
