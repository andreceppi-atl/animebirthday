/**
 * Recurring catalog checkup: merge stubs, refresh favs/photos, enrich, UGC top-up.
 * Usage: npx tsx scripts/checkup.ts [--refreshLimit=80] [--enrichLimit=30] [--forceUgc]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { runCatalogCheckup } from "../src/lib/catalog/checkup";

function argNum(name: string, fallback: number) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const refreshLimit = argNum("refreshLimit", 80);
  const enrichLimit = argNum("enrichLimit", 30);
  const forceUgc = process.argv.includes("--forceUgc");
  console.log(
    `Catalog checkup (refreshLimit=${refreshLimit}, enrichLimit=${enrichLimit}, forceUgc=${forceUgc})...`,
  );
  const result = await runCatalogCheckup({
    refreshLimit,
    enrichLimit,
    forceUgc,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error" || !result.healthy) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
