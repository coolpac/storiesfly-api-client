// Fetch the currently active stories for a public Instagram account.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=sf_live_... node examples/stories.mjs instagram
// Elsewhere:        npm install storiesfly, then run the same command.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
if (!apiKey) {
  console.error("Set STORIESFLY_API_KEY — get a key at https://storiesfly.com/developers");
  process.exit(1);
}

const sf = new StoriesFly({ apiKey });
const username = process.argv[2] ?? "instagram";

try {
  // { profile, stories, highlights, fromCache } — stories may legitimately be empty.
  const { profile, stories } = await sf.getStories(username);
  console.log(`@${profile.username} — ${stories.length} active stories`);
  for (const s of stories) console.log(`  ${s.takenAt}  ${s.mediaType}  ${s.source}`);
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(err.message);
  process.exit(1);
}
