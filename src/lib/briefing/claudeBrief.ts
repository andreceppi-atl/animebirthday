import type { MonthDigest } from "@/lib/briefing/monthDigest";

const SMS_HARD_CAP = 1200;

function truncateForSms(text: string): string {
  if (text.length <= SMS_HARD_CAP) return text;
  return `${text.slice(0, SMS_HARD_CAP - 1)}…`;
}

function daysLabel(daysUntil: number): string {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil}d`;
}

function favs(n: number): string {
  return `${n.toLocaleString()} favs`;
}

/**
 * Plain top-level summary only — biggest hits + next birthdays.
 * No ad-copy, hooks, or TikTok angles.
 */
export function formatMonthSummary(digest: MonthDigest): string {
  const birthdays = [...digest.birthdays].sort(
    (a, b) => b.favourites - a.favourites,
  );
  const soonest = [...digest.birthdays].sort(
    (a, b) => a.daysUntil - b.daysUntil || b.favourites - a.favourites,
  );

  const biggest = birthdays.slice(0, 5);
  const biggestKeys = new Set(biggest.map((b) => `${b.name}|${b.date}`));
  const nextLines = soonest
    .filter((b) => !biggestKeys.has(`${b.name}|${b.date}`))
    .slice(0, 4);

  const momentHits = [...digest.moments]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .filter(
      (m) =>
        m.premiereTiming.startsWith("Actual premiere") ||
        m.premiereTiming.startsWith("Premiere anniversary") ||
        m.type.includes("Premiere"),
    )
    .slice(0, 3);

  const sportsHits = digest.sportsPlays
    .filter((s) => s.hasProximity)
    .slice(0, 2);

  const lines: string[] = [`AnimeBirthday · ${digest.monthLabel}`, ""];

  if (biggest.length > 0) {
    lines.push("Biggest hits");
    for (const b of biggest) {
      const show = b.show ? ` · ${b.show}` : "";
      lines.push(
        `· ${b.name}${show} · ${b.date} · ${daysLabel(b.daysUntil)} · ${favs(b.favourites)}`,
      );
    }
    lines.push("");
  }

  if (nextLines.length > 0) {
    lines.push("Next birthdays");
    for (const b of nextLines) {
      const show = b.show ? ` · ${b.show}` : "";
      lines.push(
        `· ${b.name}${show} · ${b.date} · ${daysLabel(b.daysUntil)} · ${favs(b.favourites)}`,
      );
    }
    lines.push("");
  }

  if (momentHits.length > 0) {
    lines.push("Also on the calendar");
    for (const m of momentHits) {
      const timing = m.premiereTiming || m.type;
      lines.push(`· ${m.title} · ${m.date} · ${timing}`);
    }
    lines.push("");
  }

  if (sportsHits.length > 0) {
    lines.push("Sports proximity");
    for (const s of sportsHits) {
      lines.push(`· ${s.creatorAsk}`);
    }
  }

  return truncateForSms(lines.join("\n").trim());
}

/** @deprecated name kept for callers — summary is template-only, no LLM. */
export function fallbackBriefFromDigest(digest: MonthDigest): string {
  return formatMonthSummary(digest);
}

/** Build the monthly iMessage body (factual summary, no creative rewrite). */
export async function writeMonthlyBrief(digest: MonthDigest): Promise<string> {
  return formatMonthSummary(digest);
}
