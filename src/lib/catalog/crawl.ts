import {
  fetchMediaCharacterEdges,
  fetchTopCharactersWithBirthdays,
  type AniListCharacter,
} from "@/lib/anilist/client";
import { linkShowsForAniListCharacter } from "@/lib/anilist/linkShows";
import {
  replaceHashtags,
  upsertCharacter,
} from "@/lib/db/store";
import { generateHashtags } from "@/lib/tiktok/hashtags";
import { slugify } from "@/lib/utils";
import type { StoreData } from "@/lib/types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** UTC day-of-year 1–366 — stable cron rotation without durable cursors. */
export function utcDayOfYear(from: Date = new Date()): number {
  const y = from.getUTCFullYear();
  const start = Date.UTC(y, 0, 0);
  const now = Date.UTC(y, from.getUTCMonth(), from.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

/**
 * Rotate through AniList favourites pages so deep ranks get covered over days
 * without storing a cursor (Vercel FS is ephemeral).
 */
export function rotatingAniListWindow(options?: {
  pageCount?: number;
  cyclePages?: number;
  from?: Date;
}): { startPage: number; pageCount: number; cyclePages: number } {
  const pageCount = options?.pageCount ?? 10;
  const cyclePages = options?.cyclePages ?? 50;
  const day = utcDayOfYear(options?.from);
  const chunkIndex = (day - 1) % Math.ceil(cyclePages / pageCount);
  const startPage = chunkIndex * pageCount + 1;
  return { startPage, pageCount, cyclePages };
}

function uniqueSlug(base: string, used: Set<string>, anilistId?: number): string {
  let slug = base || `character-${anilistId ?? "x"}`;
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  if (anilistId) {
    slug = `${base}-${anilistId}`;
    if (!used.has(slug)) {
      used.add(slug);
      return slug;
    }
  }
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  slug = `${base}-${i}`;
  used.add(slug);
  return slug;
}

/** Upsert one AniList character with DOB into the store. */
export async function upsertAniListCharacterIntoStore(
  store: StoreData,
  remote: AniListCharacter,
  usedSlugs: Set<string>,
): Promise<{ characterId: number; showsTouched: number; created: boolean }> {
  if (!remote.dateOfBirth?.month || !remote.dateOfBirth?.day) {
    throw new Error(`Character #${remote.id} missing month/day`);
  }

  const linked = await linkShowsForAniListCharacter(store, remote);
  let showsTouched = 0;
  if (linked.primary) showsTouched++;
  showsTouched += linked.crossovers.length;

  const existing = store.characters.find((x) => x.anilistId === remote.id);
  const slug =
    existing?.slug ??
    uniqueSlug(slugify(remote.name.full), usedSlugs, remote.id);

  const showTitle =
    linked.primary?.title.english || linked.primary?.title.romaji || null;

  const character = await upsertCharacter(store, {
    anilistId: remote.id,
    slug,
    nameFull: remote.name.full,
    nameFirst: remote.name.first,
    nameLast: remote.name.last,
    nameNative: remote.name.native,
    image: remote.image.large ?? remote.image.medium,
    birthMonth: remote.dateOfBirth.month,
    birthDay: remote.dateOfBirth.day,
    favourites: remote.favourites ?? 0,
    showId: linked.showId,
    alsoShowIds: linked.alsoShowIds,
    wikiUrl: remote.siteUrl,
    description: remote.description,
    source: "anilist",
    ugcVolume: existing?.ugcVolume ?? null,
    ugcUpdatedAt: existing?.ugcUpdatedAt ?? null,
  });

  if (showTitle) {
    replaceHashtags(
      store,
      character.id,
      generateHashtags({
        nameFull: remote.name.full,
        nameFirst: remote.name.first,
        showTitle,
      }),
    );
  }

  return {
    characterId: character.id,
    showsTouched,
    created: !existing,
  };
}

export type DeepCrawlResult = {
  startPage: number;
  pageCount: number;
  fetchedWithDob: number;
  charactersUpserted: number;
  showsUpserted: number;
  created: number;
};

/** Rotating favourites-page crawl — covers deep ranks across the week. */
export async function crawlRotatingAniListBirthdays(
  store: StoreData,
  options?: { pageCount?: number; cyclePages?: number; delayMs?: number },
): Promise<DeepCrawlResult> {
  const window = rotatingAniListWindow({
    pageCount: options?.pageCount,
    cyclePages: options?.cyclePages,
  });
  const characters = await fetchTopCharactersWithBirthdays({
    startPage: window.startPage,
    maxPages: window.pageCount,
    delayMs: options?.delayMs ?? 650,
  });

  const usedSlugs = new Set(store.characters.map((c) => c.slug));
  let charactersUpserted = 0;
  let showsUpserted = 0;
  let created = 0;

  for (const c of characters) {
    const result = await upsertAniListCharacterIntoStore(store, c, usedSlugs);
    charactersUpserted++;
    showsUpserted += result.showsTouched;
    if (result.created) created++;
  }

  return {
    startPage: window.startPage,
    pageCount: window.pageCount,
    fetchedWithDob: characters.length,
    charactersUpserted,
    showsUpserted,
    created,
  };
}

export type RosterCrawlResult = {
  showsScanned: number;
  candidates: number;
  charactersUpserted: number;
  created: number;
  showTitles: string[];
};

/**
 * Walk popular catalog shows and pull MAIN/SUPPORTING cast with full DOBs.
 * Catches franchise gaps the global favourites crawl misses (e.g. JoJo Caesar).
 */
export async function crawlShowRosters(
  store: StoreData,
  options?: {
    showLimit?: number;
    maxNewFetches?: number;
    delayMs?: number;
    minShowFavourites?: number;
  },
): Promise<RosterCrawlResult> {
  const showLimit = options?.showLimit ?? 6;
  const maxNewFetches = options?.maxNewFetches ?? 18;
  const delayMs = options?.delayMs ?? 550;
  const minShowFavourites = options?.minShowFavourites ?? 500;

  const linkedShows = store.shows
    .filter((s) => s.anilistId != null && s.favourites >= minShowFavourites)
    .sort((a, b) => b.favourites - a.favourites || b.popularity - a.popularity);

  if (!linkedShows.length) {
    return {
      showsScanned: 0,
      candidates: 0,
      charactersUpserted: 0,
      created: 0,
      showTitles: [],
    };
  }

  const day = utcDayOfYear();
  const offset = (day * showLimit) % linkedShows.length;
  const batch: typeof linkedShows = [];
  for (let i = 0; i < Math.min(showLimit, linkedShows.length); i++) {
    batch.push(linkedShows[(offset + i) % linkedShows.length]);
  }

  const usedSlugs = new Set(store.characters.map((c) => c.slug));
  const knownIds = new Set(
    store.characters.map((c) => c.anilistId).filter((id): id is number => id != null),
  );

  let candidates = 0;
  let charactersUpserted = 0;
  let created = 0;
  let newFetches = 0;
  const showTitles: string[] = [];

  for (const show of batch) {
    showTitles.push(show.titleEnglish || show.titleRomaji);
    try {
      const edges = await fetchMediaCharacterEdges(show.anilistId!, {
        pages: 1,
        delayMs,
      });
      for (const { role, character: node } of edges) {
        if (role === "BACKGROUND" && (node.favourites ?? 0) < 1500) continue;
        if (!node.dateOfBirth?.month || !node.dateOfBirth?.day) continue;
        candidates++;

        if (knownIds.has(node.id)) {
          const existing = store.characters.find((c) => c.anilistId === node.id);
          if (!existing) continue;
          const nextImage = node.image.large ?? node.image.medium;
          const changed =
            existing.favourites !== (node.favourites ?? 0) ||
            (nextImage && existing.image !== nextImage);
          if (changed) {
            existing.favourites = node.favourites ?? existing.favourites;
            if (nextImage) existing.image = nextImage;
            existing.updatedAt = new Date().toISOString();
            charactersUpserted++;
          }
          continue;
        }

        if (newFetches >= maxNewFetches) continue;
        // Full character payload for show linking / description
        const result = await upsertAniListCharacterIntoStore(
          store,
          node,
          usedSlugs,
        );
        knownIds.add(node.id);
        newFetches++;
        charactersUpserted++;
        if (result.created) created++;
        await sleep(delayMs);
      }
    } catch (err) {
      console.warn(
        `roster: failed show ${show.anilistId}:`,
        err instanceof Error ? err.message : err,
      );
    }
    await sleep(delayMs);
  }

  return {
    showsScanned: batch.length,
    candidates,
    charactersUpserted,
    created,
    showTitles,
  };
}
