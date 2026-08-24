import {
  getSportsAnimeOverlaps,
  sportsCreatorAsk,
} from "@/lib/sports";
import { getUpcomingCharacters } from "@/lib/queries";
import {
  animeCalendarTypeLabel,
  premiereTimingBadge,
} from "@/lib/utils";

export type MonthDigest = {
  monthLabel: string;
  year: number;
  month: number;
  birthdays: Array<{
    name: string;
    date: string;
    daysUntil: number;
    favourites: number;
    show: string;
    demos: string[];
  }>;
  moments: Array<{
    title: string;
    date: string;
    daysUntil: number;
    type: string;
    premiereTiming: string;
    franchise: string;
  }>;
  sportsPlays: Array<{
    creatorAsk: string;
    hasProximity: boolean;
  }>;
  generatedAt: string;
};

function daysLeftInMonth(from: Date): number {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;
  const end = new Date(year, month, 0);
  end.setHours(0, 0, 0, 0);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function dateLabel(month: number, day: number): string {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Structured month digest for Claude briefing.
 * Window: from `from` through the last day of that calendar month.
 */
export async function buildMonthDigest(from: Date = new Date()): Promise<MonthDigest> {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;
  const monthLabel = from.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const daysLeft = daysLeftInMonth(from);

  if (daysLeft === 0) {
    return {
      monthLabel,
      year,
      month,
      birthdays: [],
      moments: [],
      sportsPlays: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const [birthdaysRaw, momentsRaw, sports] = await Promise.all([
    getUpcomingCharacters({
      days: daysLeft,
      limit: 80,
      sort: "relevance",
      type: "birthday",
    }),
    getUpcomingCharacters({
      days: daysLeft,
      limit: 60,
      sort: "relevance",
      type: "moment",
    }),
    getSportsAnimeOverlaps({
      days: daysLeft,
      sport: "all",
      limit: 40,
      from,
    }),
  ]);

  const inMonth = (birthMonth: number) => birthMonth === month;

  const birthdays = birthdaysRaw
    .filter((b) => inMonth(b.birthMonth))
    .slice(0, 25)
    .map((b) => ({
      name: b.nameFull,
      date: dateLabel(b.birthMonth, b.birthDay),
      daysUntil: b.daysUntil,
      favourites: b.favourites,
      show: b.show?.titleEnglish || b.show?.titleRomaji || "",
      demos: b.show?.demos ?? [],
    }));

  const moments = momentsRaw
    .filter((m) => inMonth(m.birthMonth))
    .slice(0, 15)
    .map((m) => ({
      title: m.nameFull,
      date: dateLabel(m.birthMonth, m.birthDay),
      daysUntil: m.daysUntil,
      type: animeCalendarTypeLabel(m.feedKind, m.momentKind, {
        year: m.year,
        nextDate: m.nextDate,
      }),
      premiereTiming:
        premiereTimingBadge({
          momentKind: m.momentKind,
          year: m.year,
          nextDate: m.nextDate,
        }) ?? "",
      franchise: m.franchise || m.show?.titleEnglish || m.show?.titleRomaji || "",
    }));

  // Proximity-first already from getSportsAnimeOverlaps sort
  const sportsPlays = sports.overlaps
    .filter((o) => o.sportsEvent.month === month)
    .slice(0, 15)
    .map((o) => ({
      creatorAsk: sportsCreatorAsk(o),
      hasProximity: o.hasProximity,
    }));

  return {
    monthLabel,
    year,
    month,
    birthdays,
    moments,
    sportsPlays,
    generatedAt: new Date().toISOString(),
  };
}
