import "dotenv/config";
import { readStore } from "../src/lib/db/store";
import { hasDatabaseUrl, syncStoreToPostgres } from "../src/lib/db/postgres";

async function main() {
  if (!hasDatabaseUrl()) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }
  const store = await readStore();
  console.log(
    `Syncing ${store.characters.length} characters / ${store.shows.length} shows to Postgres...`,
  );
  await syncStoreToPostgres(store);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
