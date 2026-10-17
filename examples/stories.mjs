// Print the stories an Instagram account has up right now.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=your_key node examples/stories.mjs instagram
// Elsewhere:        npm install storiesfly, then run the same command.
//
// One call, one unit. An account with no stories gives an empty list, and that is
// charged too.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
if (!apiKey) {
  console.error("Set STORIESFLY_API_KEY. Get a key at https://storiesfly.com/developers/dashboard");
  process.exit(1);
}

// STORIESFLY_BASE_URL is only for pointing the example at a test server.
const client = new StoriesFly({ apiKey, baseUrl: process.env.STORIESFLY_BASE_URL });
const username = process.argv[2] ?? "instagram";

try {
  const { data, meta } = await client.user.stories({ username }, { withMeta: true });
  console.log(`@${data.user.username ?? username}: ${data.stories.length} stories up now`);
  for (const story of data.stories) {
    console.log(`  ${story.taken_at_iso}  ${story.media_type}  ${story.media_url}`);
  }
  console.log(`charged ${meta.unitsCharged} unit, balance $${meta.balanceRemaining}, request ${meta.requestId}`);
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(`${err.code} (HTTP ${err.status}): ${err.message}`);
  if (err.code === "telegram_required") console.error(`Link your Telegram account: ${err.linkUrl}`);
  if (err.code === "credits_exhausted") console.error("Top up at https://storiesfly.com/developers/dashboard");
  process.exit(1);
}
