import {
  animeCalendarTypeLabel,
  premiereTimingBadge,
} from "@/lib/utils";
import { sportsCreatorAsk } from "@/lib/sports/brief";
import { sportsEventLabel } from "@/lib/sports/load";
import type { SportsAnimeOverlap } from "@/lib/sports/types";

export type SportsOverlapExportRow = {
  order: number;
  creatorAsk: string;
  sportsLabel: string;
  sportsTitle: string;
  animeType: string;
  premiereTiming: string;
  animeName: string;
  franchise: string;
  date: string;
  daysUntil: number;
  proximity: string;
  proximityHints: string;
  overlapScore: number;
};

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sportsOverlapRowsToCsv(rows: SportsOverlapExportRow[]): string {
  const header = [
    "Order",
    "Creator ask",
    "Sports label",
    "Sports title",
    "Anime type",
    "Premiere timing",
    "Anime name",
    "Franchise/show",
    "Date",
    "Days until",
    "Proximity",
    "Proximity hints",
    "Overlap score",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.order,
        r.creatorAsk,
        r.sportsLabel,
        r.sportsTitle,
        r.animeType,
        r.premiereTiming,
        r.animeName,
        r.franchise,
        r.date,
        r.daysUntil,
        r.proximity,
        r.proximityHints,
        r.overlapScore,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function buildSportsOverlapExportRows(
  overlaps: SportsAnimeOverlap[],
): SportsOverlapExportRow[] {
  return overlaps.map((overlap, index) => {
    const { sportsEvent: e, animeItem: a } = overlap;
    const date = `${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`;
    const franchise =
      a.show?.titleEnglish ||
      a.show?.titleRomaji ||
      a.franchise ||
      "";
    return {
      order: index + 1,
      creatorAsk: sportsCreatorAsk(overlap),
      sportsLabel: sportsEventLabel(e),
      sportsTitle: e.title,
      animeType: animeCalendarTypeLabel(a.feedKind, a.momentKind, {
        year: a.year,
        nextDate: a.nextDate,
      }),
      premiereTiming:
        premiereTimingBadge({
          momentKind: a.momentKind,
          year: a.year,
          nextDate: a.nextDate,
        }) ?? "",
      animeName: a.nameFull,
      franchise,
      date,
      daysUntil: e.daysUntil,
      proximity: overlap.hasProximity ? "yes" : "no",
      proximityHints: [
        ...new Set(overlap.proximityMatches.map((m) => m.hint)),
      ].join(" · "),
      overlapScore: Math.round(overlap.overlapScore * 10) / 10,
    };
  });
}
