import "dotenv/config";
import { ingestFromAniList, ingestFromWiki } from "../src/lib/ingest";

async function main() {
  const includeWiki = process.argv.includes("--wiki");
  const maxPagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 12;

  console.log(`Seeding from AniList (maxPages=${maxPages})...`);
  const anilist = await ingestFromAniList({ maxPages });
  console.log("AniList:", anilist);

  if (includeWiki) {
    console.log("Seeding from wiki/MAL calendars...");
    const wiki = await ingestFromWiki();
    console.log("Wiki:", wiki);
  } else {
    console.log("Skipping wiki (pass --wiki to include).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
