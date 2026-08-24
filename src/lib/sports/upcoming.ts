import { formatBirthday, nextBirthdayDate } from "@/lib/utils";
import { loadSportsEventsSeed } from "./load";
import type { Sport, SportsEventSeed, UpcomingSportsEvent } from "./types";

/**
 * Next occurrence of a sports event from `from`.
 * Year-specific (non-recurring) events only surface if that date is still ahead.
 */
export function nextSportsEventDate(
  event: SportsEventSeed,
  from: Date = new Date(),
): Date | null {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  if (event.year != null && !event.recurring) {
    const dim = new Date(event.year, event.month, 0).getDate();
    const day = Math.min(event.day, dim);
    const dated = new Date(event.year, event.month - 1, day);
    dated.setHours(0, 0, 0, 0);
    if (dated < start) return null;
    return dated;
  }

  return nextBirthdayDate(event.month, event.day, from);
}

export function toUpcomingSportsEvent(
  event: SportsEventSeed,
  from: Date = new Date(),
): UpcomingSportsEvent | null {
  const next = nextSportsEventDate(event, from);
  if (!next) return null;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const daysUntil = Math.round(
    (next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    ...event,
    daysUntil,
    nextDate: next.toISOString(),
    dateLabel: formatBirthday(event.month, event.day),
  };
}

export async function getUpcomingSportsEvents(options?: {
  days?: number;
  sport?: Sport | "all";
  limit?: number;
  from?: Date;
}): Promise<UpcomingSportsEvent[]> {
  const days = options?.days ?? 60;
  const limit = options?.limit ?? 40;
  const sport = options?.sport ?? "all";
  const from = options?.from ?? new Date();

  const seed = await loadSportsEventsSeed();
  const upcoming = seed
    .map((e) => toUpcomingSportsEvent(e, from))
    .filter((e): e is UpcomingSportsEvent => Boolean(e))
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= days)
    .filter((e) => (sport === "all" ? true : e.sport === sport))
    .sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return b.significance - a.significance;
    });

  return upcoming.slice(0, limit);
}
