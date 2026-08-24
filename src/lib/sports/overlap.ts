import {
  getUpcomingCharacters,
  type UpcomingItem,
} from "@/lib/queries";
import { getUpcomingSportsEvents } from "./upcoming";
import type {
  ProximityMatch,
  Sport,
  SportsAnimeOverlap,
  UpcomingSportsEvent,
} from "./types";

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .trim();
}

/** Too broad to count as sport↔anime proximity on their own */
const GENERIC_HINTS = new Set([
  "sports",
  "action",
  "adventure",
  "comedy",
  "drama",
  "shounen",
  "seinen",
]);

function findProximityMatches(
  event: UpcomingSportsEvent,
  item: UpcomingItem,
): ProximityMatch[] {
  const hints = event.animeProximityHints ?? [];
  if (hints.length === 0) return [];

  const fields: Array<{ field: ProximityMatch["field"]; values: string[] }> = [
    { field: "name", values: [item.nameFull] },
    {
      field: "franchise",
      values: [item.franchise ?? ""].filter(Boolean),
    },
    {
      field: "show",
      values: [
        item.show?.titleEnglish ?? "",
        item.show?.titleRomaji ?? "",
        ...(item.alsoShows ?? []).flatMap((s) => [
          s.titleEnglish ?? "",
          s.titleRomaji,
        ]),
      ].filter(Boolean),
    },
    {
      field: "genre",
      values: item.show?.genres ?? [],
    },
    {
      field: "tag",
      values: [
        ...(item.show?.demos ?? []),
        item.momentKind ?? "",
      ].filter(Boolean),
    },
  ];

  const matches: ProximityMatch[] = [];
  const seen = new Set<string>();

  for (const hint of hints) {
    const h = normalize(hint);
    if (!h || GENERIC_HINTS.has(h)) continue;
    for (const { field, values } of fields) {
      // Genre/demo tags only count for specific sport themes (baseball, volleyball…)
      if (
        (field === "genre" || field === "tag") &&
        (GENERIC_HINTS.has(h) || h.length < 5)
      ) {
        continue;
      }
      for (const value of values) {
        const v = normalize(value);
        if (!v) continue;
        // Substring either way: "Haikyuu!!" ↔ "Haikyuu", "Ace of the Diamond" ↔ hint
        const hit =
          v.includes(h) ||
          h.includes(v) ||
          (h.length >= 5 && v.split(/\s+/).some((tok) => tok === h));
        if (!hit) continue;
        const key = `${field}:${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ hint, field });
      }
    }
  }

  return matches;
}

/**
 * Overlap score for same-calendar-day sports × anime pairs.
 *
 * Components:
 * - sports significance (0–100)
 * - anime relevance / favourites heat
 * - recency (sooner = higher)
 * - proximity bonus when animeProximityHints match show/franchise/genres
 * - MLB soft boost (product emphasis after recent social spikes)
 */
export function scoreOverlap(
  event: UpcomingSportsEvent,
  item: UpcomingItem,
  proximityMatches: ProximityMatch[],
): number {
  const sportsHeat = event.significance;
  const animeHeat =
    item.relevance * 0.45 +
    Math.log10(Math.max(item.favourites, 1)) * 12;
  const recency = Math.max(0, 40 - item.daysUntil * 0.55);

  let proximity = 0;
  if (proximityMatches.length > 0) {
    const franchiseHit = proximityMatches.some(
      (m) => m.field === "show" || m.field === "franchise" || m.field === "name",
    );
    const genreHit = proximityMatches.some((m) => m.field === "genre");
    proximity =
      28 +
      proximityMatches.length * 6 +
      (franchiseHit ? 22 : 0) +
      (genreHit && !franchiseHit ? 8 : 0);
  }

  const mlbBoost = event.sport === "mlb" ? 8 : 0;

  return sportsHeat * 0.55 + animeHeat + recency + proximity + mlbBoost;
}

function sameCalendarDay(
  event: UpcomingSportsEvent,
  item: UpcomingItem,
): boolean {
  return (
    event.month === item.birthMonth &&
    event.day === item.birthDay &&
    event.daysUntil === item.daysUntil
  );
}

export async function getSportsAnimeOverlaps(options?: {
  days?: number;
  sport?: Sport | "all";
  limit?: number;
  animeLimit?: number;
  from?: Date;
}): Promise<{
  sports: UpcomingSportsEvent[];
  overlaps: SportsAnimeOverlap[];
  days: number;
  sport: Sport | "all";
}> {
  const days = options?.days ?? 60;
  const sport = options?.sport ?? "all";
  const limit = options?.limit ?? 60;
  const animeLimit = options?.animeLimit ?? 300;
  const from = options?.from ?? new Date();

  const [sports, anime] = await Promise.all([
    getUpcomingSportsEvents({ days, sport, limit: 80, from }),
    getUpcomingCharacters({
      days,
      limit: animeLimit,
      sort: "date",
      type: "all",
    }),
  ]);

  const overlaps: SportsAnimeOverlap[] = [];

  for (const event of sports) {
    for (const item of anime) {
      if (!sameCalendarDay(event, item)) continue;
      const proximityMatches = findProximityMatches(event, item);
      const overlapScore = scoreOverlap(event, item, proximityMatches);
      overlaps.push({
        sportsEvent: event,
        animeItem: {
          feedKind: item.feedKind,
          id: item.id,
          slug: item.slug,
          nameFull: item.nameFull,
          image: item.image,
          birthMonth: item.birthMonth,
          birthDay: item.birthDay,
          favourites: item.favourites,
          daysUntil: item.daysUntil,
          nextDate: item.nextDate,
          relevance: item.relevance,
          momentKind: item.momentKind,
          franchise: item.franchise,
          year: item.year ?? null,
          show: item.show,
        },
        overlapScore,
        proximityMatches,
        hasProximity: proximityMatches.length > 0,
      });
    }
  }

  overlaps.sort((a, b) => {
    if (a.hasProximity !== b.hasProximity) {
      return a.hasProximity ? -1 : 1;
    }
    if (b.overlapScore !== a.overlapScore) {
      return b.overlapScore - a.overlapScore;
    }
    return a.sportsEvent.daysUntil - b.sportsEvent.daysUntil;
  });

  return {
    sports,
    overlaps: overlaps.slice(0, limit),
    days,
    sport,
  };
}
