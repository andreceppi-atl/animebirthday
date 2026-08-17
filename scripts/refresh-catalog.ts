/**
 * Merge wiki stubs + refresh AniList favs/images + enrich stubs.
 * Usage: npx tsx scripts/refresh-catalog.ts [--refreshLimit=180] [--enrichLimit=40]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { refreshCatalog } from "../src/lib/catalog/refresh";

function argNum(name: string, fallback: number) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const refreshLimit = argNum("refreshLimit", 180);
  const enrichLimit = argNum("enrichLimit", 40);
  console.log(
    `Refreshing catalog (refreshLimit=${refreshLimit}, enrichLimit=${enrichLimit})...`,
  );
  const result = await refreshCatalog({ refreshLimit, enrichLimit });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
