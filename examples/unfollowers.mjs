// List tracker events and print follow / unfollow changes.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=sf_live_... node examples/unfollowers.mjs
// Needs a Tracker plan (or a Basic/Pro web subscription) and at least one tracked account.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
if (!apiKey) {
  console.error("Set STORIESFLY_API_KEY — get a key at https://storiesfly.com/developers");
  process.exit(1);
}

// The event kind is `activityType`; the other account is `targetUsername`.
const LABELS = { FOLLOW: "started following", UNFOLLOW: "unfollowed",
  FOLLOWER_ADDED: "gained follower", FOLLOWER_REMOVED: "lost follower" };

try {
  const sf = new StoriesFly({ apiKey });
  const { accounts, activities, total } = await sf.getTrackerEvents({ page: 1, limit: 200 });
  console.log(`${accounts.length} tracked account(s), ${total} logged events`);
  for (const e of activities.filter((e) => LABELS[e.activityType]))
    console.log(`${e.detectedAt}  @${e.igUsername} ${LABELS[e.activityType]} @${e.targetUsername ?? "?"}`);
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(err.message);
  process.exit(1);
}
