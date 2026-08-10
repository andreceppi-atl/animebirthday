import "dotenv/config";
import { saturateBirthdayWindow } from "../src/lib/ingest";

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const windowDays = daysArg ? Number(daysArg.split("=")[1]) : 60;
  const maxPages = pagesArg ? Number(pagesArg.split("=")[1]) : 35;

  console.log(
    `Saturating birthdays for next ${windowDays} days (maxPages=${maxPages})...`,
  );
  const result = await saturateBirthdayWindow({ windowDays, maxPages });
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
