/**
 * Batch ChartEx UGC stamp for upcoming birthdays + high-significance moments.
 * Usage: npx tsx scripts/stamp-ugc.ts [--limit=40] [--moments=20]
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { stampUpcomingUgc } from "../src/lib/chartex/stamp";

function argNum(name: string, fallback: number) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const result = await stampUpcomingUgc({
    characterLimit: argNum("limit", 40),
    momentLimit: argNum("moments", 20),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
