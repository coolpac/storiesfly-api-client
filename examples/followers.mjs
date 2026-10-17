// Walk the followers of an account, a few pages at a time.
//
// From a checkout:  npm install && npm run build
//                   STORIESFLY_API_KEY=your_key node examples/followers.mjs instagram 3
// Arguments: the username, then how many pages to read (default 2).
//
// A page holds up to 25 followers and costs one unit. `maxPages` is what keeps a
// large account from running up the bill: without it, paginate follows the list to its end.

import { StoriesFly, StoriesFlyError } from "storiesfly";

const apiKey = process.env.STORIESFLY_API_KEY;
if (!apiKey) {
  console.error("Set STORIESFLY_API_KEY. Get a key at https://storiesfly.com/developers/dashboard");
  process.exit(1);
}

const client = new StoriesFly({ apiKey, baseUrl: process.env.STORIESFLY_BASE_URL });
const username = process.argv[2] ?? "instagram";
const maxPages = Number(process.argv[3] ?? 2);

try {
  let pages = 0;
  let units = 0;
  let count = 0;
  let last = null;

  for await (const { data, meta } of client.paginate(client.user.followers, { username }, { maxPages, withMeta: true })) {
    pages += 1;
    units += meta.unitsCharged ?? 0;
    for (const user of data.users) {
      count += 1;
      console.log(`${String(count).padStart(4)}  @${user.username ?? user.id}${user.verified ? " (verified)" : ""}`);
    }
    last = data;
  }

  console.log(`${count} followers of @${username} in ${pages} pages, ${units} units`);
  if (last?.has_more) console.log(`There are more. Start the next walk with cursor: ${last.next_cursor}`);
} catch (err) {
  if (!(err instanceof StoriesFlyError)) throw err;
  console.error(`${err.code} (HTTP ${err.status}): ${err.message}`);
  process.exit(1);
}
