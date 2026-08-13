import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { ingestMoments } from "../src/lib/ingest";

async function main() {
  console.log("Scraping significant JP media moments...");
  const result = await ingestMoments();
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
