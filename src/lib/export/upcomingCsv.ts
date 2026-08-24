import {
  animeCalendarTypeLabel,
  hashtagSlug,
  premiereTimingBadge,
} from "@/lib/utils";
import { tiktokTagUrl } from "@/lib/tiktok/hashtags";
import type { CharacterWithShow } from "@/lib/types";
import type { UpcomingItem } from "@/lib/queries";

export type ExportRow = {
  order: number;
  name: string;
  anime: string;
  description: string;
  ugcLink: string;
  hashtag: string;
  date: string;
  favourites: number;
  type: string;
  premiereTiming: string;
  daysUntil: number;
  suggestedAngle: string;
};

/** Strip AniList spoiler/markdown noise for spreadsheet cells. */
export function plainDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/~![\s\S]*?!~/g, " ")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: ExportRow[]): string {
  const header = [
    "Order",
    "Name",
    "Anime of origin",
    "Character description",
    "UGC / hashtag link",
    "Hashtag",
    "Date",
    "Favourites",
    "Type",
    "Premiere timing",
    "Days until",
    "Suggested angle",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.order,
        r.name,
        r.anime,
        r.description,
        r.ugcLink,
        r.hashtag,
        r.date,
        r.favourites,
        r.type,
        r.premiereTiming,
        r.daysUntil,
        r.suggestedAngle,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function primaryTag(
  nameFull: string,
  showTitle: string | null,
  storedTags: Array<{ tag: string; kind: string }>,
): string {
  const nameTag =
    storedTags.find((t) => t.kind === "name")?.tag ||
    hashtagSlug(nameFull) ||
    "";
  if (nameTag) return nameTag;
  if (showTitle) return hashtagSlug(showTitle);
  return "";
}

function itemTypeLabel(item: UpcomingItem): string {
  return animeCalendarTypeLabel(item.feedKind, item.momentKind, {
    year: item.year,
    nextDate: item.nextDate,
  });
}

function itemPremiereTiming(item: UpcomingItem): string {
  if (item.feedKind !== "moment") return "";
  return (
    premiereTimingBadge({
      momentKind: item.momentKind,
      year: item.year,
      nextDate: item.nextDate,
    }) ?? ""
  );
}

function suggestedAngle(item: UpcomingItem): string {
  if (item.feedKind === "birthday") {
    return `Birthday UGC day-of / ±1d · lean into ${item.show?.titleEnglish || item.show?.titleRomaji || "franchise"} nostalgia + trend sound`;
  }
  const timing = premiereTimingBadge({
    momentKind: item.momentKind,
    year: item.year,
    nextDate: item.nextDate,
  });
  if (timing?.startsWith("Actual")) {
    return `First-airing / premiere window · announce + react edits, not anniversary framing`;
  }
  if (timing) {
    return `Premiere anniversary · throwback edits, not "new episode" language`;
  }
  return `Moment play · tie franchise + date into short-form hook`;
}

/**
 * Build spreadsheet rows from the current upcoming list order.
 * Prefer a saved TikTok video URL; otherwise link the primary hashtag.
 */
export function buildExportRows(
  items: UpcomingItem[],
  charactersById: Map<number, CharacterWithShow>,
): ExportRow[] {
  return items.map((item, index) => {
    const date = `${String(item.birthMonth).padStart(2, "0")}-${String(item.birthDay).padStart(2, "0")}`;
    const type = itemTypeLabel(item);
    const premiereTiming = itemPremiereTiming(item);
    const angle = suggestedAngle(item);

    if (item.feedKind === "moment") {
      const tag =
        hashtagSlug(item.franchise || item.nameFull) ||
        hashtagSlug(item.nameFull);
      return {
        order: index + 1,
        name: item.nameFull,
        anime: item.franchise || "",
        description: plainDescription(item.summary),
        ugcLink: tag ? tiktokTagUrl(tag) : "",
        hashtag: tag ? `#${tag}` : "",
        date,
        favourites: item.favourites,
        type,
        premiereTiming,
        daysUntil: item.daysUntil,
        suggestedAngle: angle,
      };
    }

    const character = charactersById.get(item.id);
    const anime =
      item.show?.titleEnglish ||
      item.show?.titleRomaji ||
      character?.show?.titleEnglish ||
      character?.show?.titleRomaji ||
      "";
    const description = plainDescription(character?.description ?? null);
    const topVideo = character?.tiktokVideos?.[0]?.videoUrl ?? "";
    const tag = primaryTag(
      item.nameFull,
      anime || null,
      character?.hashtags ?? [],
    );
    const ugcLink = topVideo || (tag ? tiktokTagUrl(tag) : "");

    return {
      order: index + 1,
      name: item.nameFull,
      anime,
      description,
      ugcLink,
      hashtag: tag ? `#${tag}` : "",
      date,
      favourites: item.favourites,
      type,
      premiereTiming,
      daysUntil: item.daysUntil,
      suggestedAngle: angle,
    };
  });
}
