import {
  animeCalendarTypeLabel,
  isActualPremiere,
  premiereTimingBadge,
} from "@/lib/utils";
import { sportsEventLabel } from "@/lib/sports/load";
import type { SportsAnimeOverlap } from "@/lib/sports/types";

export function sportsCreatorAsk(overlap: SportsAnimeOverlap): string {
  const { sportsEvent: e, animeItem: a, hasProximity } = overlap;
  const anime = animeCalendarTypeLabel(a.feedKind, a.momentKind, {
    year: a.year,
    nextDate: a.nextDate,
  });
  const window =
    e.daysUntil === 0
      ? "post day-of"
      : e.daysUntil === 1
        ? "post tomorrow / day-of"
        : `plan now · post in ${e.daysUntil}d (±1)`;
  const fit = hasProximity ? "proximity fit" : "same-day timing only";
  return `${sportsEventLabel(e)} × ${anime} · ${window} · ${fit}`;
}

export type SportsView = "plan" | "proximity" | "sameday" | "premieres";

export function filterOverlapsForView(
  overlaps: SportsAnimeOverlap[],
  view: SportsView,
): SportsAnimeOverlap[] {
  if (view === "plan") return overlaps;
  if (view === "proximity") return overlaps.filter((o) => o.hasProximity);
  if (view === "sameday") return overlaps.filter((o) => !o.hasProximity);
  return overlaps.filter(
    (o) =>
      isActualPremiere({
        momentKind: o.animeItem.momentKind,
        year: o.animeItem.year,
        nextDate: o.animeItem.nextDate,
      }) ||
      Boolean(
        premiereTimingBadge({
          momentKind: o.animeItem.momentKind,
          year: o.animeItem.year,
          nextDate: o.animeItem.nextDate,
        }),
      ),
  );
}

export function parseSportsView(raw: string | undefined): SportsView {
  if (
    raw === "plan" ||
    raw === "proximity" ||
    raw === "sameday" ||
    raw === "premieres"
  ) {
    return raw;
  }
  return "plan";
}
