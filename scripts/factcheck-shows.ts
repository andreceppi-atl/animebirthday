/**
 * Fact-check character → show links against AniList MAIN roles.
 * Usage:
 *   npx tsx scripts/factcheck-shows.ts              # report only
 *   npx tsx scripts/factcheck-shows.ts --repair     # fix mismatches
 *   npx tsx scripts/factcheck-shows.ts --limit=100 --repair
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { factCheckCharacterShows } from "../src/lib/factcheck/shows";
import { promises as fs } from "fs";
import path from "path";

function argNum(name: string, fallback?: number) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const repair = process.argv.includes("--repair");
  const force = process.argv.includes("--force");
  const limit = argNum("limit");
  const minFavourites = argNum("minFavourites", 0);

  console.log(
    `Fact-checking character shows (repair=${repair}, force=${force}, limit=${limit ?? "all"})...`,
  );
  const result = await factCheckCharacterShows({
    repair,
    force,
    limit,
    minFavourites,
  });

  const reportPath = path.join(
    process.cwd(),
    "data",
    "factcheck-shows-report.json",
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        status: result.status,
        checked: result.checked,
        mismatches: result.mismatches,
        repaired: result.repaired,
        skipped: result.skipped,
        syncedToPostgres: result.syncedToPostgres,
        report: reportPath,
        sampleIssues: result.issues.slice(0, 15).map((i) => ({
          slug: i.slug,
          from: i.currentShow,
          to: i.expectedShow,
          reason: i.reason,
        })),
      },
      null,
      2,
    ),
  );

  if (result.status === "error") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
