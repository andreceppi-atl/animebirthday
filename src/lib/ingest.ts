import {
  fetchTopCharactersWithBirthdays,
  mediaWithRoles,
  pickPrimaryMedia,
  type AniListCharacter,
} from "@/lib/anilist/client";
import { linkShowsForAniListCharacter } from "@/lib/anilist/linkShows";
import {
  addIngestRun,
  loadWorkingStore,
  persistWorkingStore,
  replaceHashtags,
  upsertCharacter,
  upsertMoment,
  upsertShow,
  writeStore,
} from "@/lib/db/store";
import { generateHashtags } from "@/lib/tiktok/hashtags";
import { daysUntilBirthday, extractDemos, slugify } from "@/lib/utils";
import { scrapeWikiBirthdays } from "@/lib/wiki/scrape";
import { scrapeSignificantMoments } from "@/lib/wiki/moments";
import type { StoreData } from "@/lib/types";

export type IngestResult = {
  source: string;
  charactersUpserted: number;
  showsUpserted: number;
  momentsUpserted?: number;
  status: "success" | "error";
  error?: string;
  syncedToPostgres?: boolean;
};

async function persistStore(store: StoreData): Promise<boolean> {
  return persistWorkingStore(store);
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

export async function ingestFromAniList(options?: {
  maxPages?: number;
}): Promise<IngestResult> {
  const store = await loadWorkingStore();
  const run = addIngestRun(store, {
    source: "anilist",
    status: "running",
    charactersUpserted: 0,
    showsUpserted: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  try {
    const characters = await fetchTopCharactersWithBirthdays({
      maxPages: options?.maxPages ?? 15,
    });

    const usedSlugs = new Set(store.characters.map((c) => c.slug));
    let charactersUpserted = 0;
    let showsUpserted = 0;

    for (const c of characters) {
      const linked = await linkShowsForAniListCharacter(store, c);
      const showId = linked.showId;
      const alsoShowIds = linked.alsoShowIds;
      if (linked.primary) showsUpserted++;
      showsUpserted += linked.crossovers.length;

      const baseSlug = slugify(c.name.full);
      // Reserve slug if new
      const existing = store.characters.find((x) => x.anilistId === c.id);
      const slug = existing?.slug ?? uniqueSlug(baseSlug, usedSlugs, c.id);

      const showTitle =
        linked.primary?.title.english || linked.primary?.title.romaji || null;

      const character = await upsertCharacter(store, {
        anilistId: c.id,
        slug,
        nameFull: c.name.full,
        nameFirst: c.name.first,
        nameLast: c.name.last,
        nameNative: c.name.native,
        image: c.image.large ?? c.image.medium,
        birthMonth: c.dateOfBirth.month!,
        birthDay: c.dateOfBirth.day!,
        favourites: c.favourites ?? 0,
        showId,
        alsoShowIds,
        wikiUrl: c.siteUrl,
        description: c.description,
        source: "anilist",
        ugcVolume: existing?.ugcVolume ?? null,
        ugcUpdatedAt: existing?.ugcUpdatedAt ?? null,
      });

      replaceHashtags(
        store,
        character.id,
        generateHashtags({
          nameFull: c.name.full,
          nameFirst: c.name.first,
          showTitle,
        }),
      );

      charactersUpserted++;
    }

    run.status = "success";
    run.charactersUpserted = charactersUpserted;
    run.showsUpserted = showsUpserted;
    run.finishedAt = new Date().toISOString();
    const syncedToPostgres = await persistStore(store);

    return {
      source: "anilist",
      charactersUpserted,
      showsUpserted,
      status: "success",
      syncedToPostgres,
    };
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    try {
      await writeStore(store);
    } catch {
      /* ignore read-only FS */
    }
    return {
      source: "anilist",
      charactersUpserted: 0,
      showsUpserted: 0,
      status: "error",
      error: run.error,
    };
  }
}

export async function ingestFromWiki(): Promise<IngestResult> {
  const store = await loadWorkingStore();
  const run = addIngestRun(store, {
    source: "wiki",
    status: "running",
    charactersUpserted: 0,
    showsUpserted: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  try {
    const entries = await scrapeWikiBirthdays();
    const usedSlugs = new Set(store.characters.map((c) => c.slug));
    let charactersUpserted = 0;
    let showsUpserted = 0;

    for (const entry of entries) {
      const nameKey = slugify(entry.name);
      const existing = store.characters.find(
        (c) =>
          slugify(c.nameFull) === nameKey ||
          (entry.wikiUrl && c.wikiUrl === entry.wikiUrl),
      );

      // If already have AniList record, only attach wiki URL if missing
      if (existing) {
        if (!existing.wikiUrl && entry.wikiUrl) {
          existing.wikiUrl = entry.wikiUrl;
          existing.updatedAt = new Date().toISOString();
          charactersUpserted++;
        }
        continue;
      }

      let showId: number | null = null;
      if (entry.series) {
        const seriesSlug = slugify(entry.series);
        let show = store.shows.find(
          (s) =>
            slugify(s.titleRomaji) === seriesSlug ||
            (s.titleEnglish && slugify(s.titleEnglish) === seriesSlug),
        );
        if (!show) {
          show = await upsertShow(store, {
            anilistId: null,
            titleRomaji: entry.series,
            titleEnglish: entry.series,
            titleNative: null,
            coverImage: null,
            genres: [],
            demos: [],
            popularity: 0,
            favourites: 0,
            siteUrl: null,
          });
          showsUpserted++;
        }
        showId = show.id;
      }

      const slug = uniqueSlug(nameKey, usedSlugs);
      const character = await upsertCharacter(store, {
        anilistId: null,
        slug,
        nameFull: entry.name,
        nameFirst: null,
        nameLast: null,
        nameNative: null,
        image: null,
        birthMonth: entry.birthMonth,
        birthDay: entry.birthDay,
        favourites: 0,
        showId,
        alsoShowIds: [],
        wikiUrl: entry.wikiUrl,
        description: null,
        source: "wiki",
        ugcVolume: null,
        ugcUpdatedAt: null,
      });

      replaceHashtags(
        store,
        character.id,
        generateHashtags({
          nameFull: entry.name,
          showTitle: entry.series,
        }),
      );
      charactersUpserted++;
    }

    run.status = "success";
    run.charactersUpserted = charactersUpserted;
    run.showsUpserted = showsUpserted;
    run.finishedAt = new Date().toISOString();
    const syncedToPostgres = await persistStore(store);

    return {
      source: "wiki",
      charactersUpserted,
      showsUpserted,
      status: "success",
      syncedToPostgres,
    };
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    try {
      await writeStore(store);
    } catch {
      /* ignore */
    }
    return {
      source: "wiki",
      charactersUpserted: 0,
      showsUpserted: 0,
      status: "error",
      error: run.error,
    };
  }
}

export async function runFullIngest(options?: {
  maxPages?: number;
  includeWiki?: boolean;
  includeMoments?: boolean;
}): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  results.push(await ingestFromAniList({ maxPages: options?.maxPages }));
  if (options?.includeWiki !== false) {
    results.push(await ingestFromWiki());
  }
  if (options?.includeMoments !== false) {
    results.push(await ingestMoments());
  }
  return results;
}

export async function ingestMoments(): Promise<IngestResult> {
  const store = await loadWorkingStore();
  const run = addIngestRun(store, {
    source: "moments",
    status: "running",
    charactersUpserted: 0,
    showsUpserted: 0,
    momentsUpserted: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  try {
    const scraped = await scrapeSignificantMoments();
    const used = new Set(store.moments.map((m) => m.slug));
    let momentsUpserted = 0;

    for (const m of scraped) {
      let slug = slugify(m.title) || `moment-${m.month}-${m.day}`;
      const existingBySlug = store.moments.find((x) => x.slug === slug);
      if (used.has(slug) && !existingBySlug) {
        let i = 2;
        while (used.has(`${slug}-${i}`)) i++;
        slug = `${slug}-${i}`;
      }
      used.add(slug);

      const existing = store.moments.find((x) => x.slug === slug);
      await upsertMoment(store, {
        slug,
        title: m.title,
        summary: m.summary,
        kind: m.kind,
        franchise: m.franchise,
        image: m.image,
        month: m.month,
        day: m.day,
        year: m.year,
        significance: m.significance,
        wikiUrl: m.wikiUrl,
        source: m.source,
        tags: m.tags,
        ugcVolume: existing?.ugcVolume ?? null,
        ugcUpdatedAt: existing?.ugcUpdatedAt ?? null,
      });
      momentsUpserted++;
    }

    run.status = "success";
    run.momentsUpserted = momentsUpserted;
    run.finishedAt = new Date().toISOString();
    const syncedToPostgres = await persistStore(store);
    return {
      source: "moments",
      charactersUpserted: 0,
      showsUpserted: 0,
      momentsUpserted,
      status: "success",
      syncedToPostgres,
    };
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    try {
      await writeStore(store);
    } catch {
      /* ignore */
    }
    return {
      source: "moments",
      charactersUpserted: 0,
      showsUpserted: 0,
      momentsUpserted: 0,
      status: "error",
      error: run.error,
    };
  }
}

/**
 * Deep AniList crawl to saturate birthdays in the next `windowDays` (default 60).
 * Keeps paging until coverage plateaus or maxPages hit.
 */
export async function saturateBirthdayWindow(options?: {
  windowDays?: number;
  maxPages?: number;
}): Promise<IngestResult & { windowDays: number; matchedInWindow: number }> {
  const windowDays = options?.windowDays ?? 60;
  const maxPages = options?.maxPages ?? 40;
  const store = await loadWorkingStore();
  const run = addIngestRun(store, {
    source: "saturate",
    status: "running",
    charactersUpserted: 0,
    showsUpserted: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  try {
    const characters = await fetchTopCharactersWithBirthdays({
      maxPages,
      perPage: 50,
      delayMs: 650,
    });

    const usedSlugs = new Set(store.characters.map((c) => c.slug));
    let charactersUpserted = 0;
    let showsUpserted = 0;
    let matchedInWindow = 0;

    for (const c of characters) {
      const month = c.dateOfBirth.month!;
      const day = c.dateOfBirth.day!;
      const daysUntil = daysUntilBirthday(month, day);
      if (daysUntil > windowDays) continue;
      matchedInWindow++;

      const linked = await linkShowsForAniListCharacter(store, c);
      const showId = linked.showId;
      const alsoShowIds = linked.alsoShowIds;
      if (linked.primary) showsUpserted++;
      showsUpserted += linked.crossovers.length;

      const existing = store.characters.find((x) => x.anilistId === c.id);
      const slug =
        existing?.slug ?? uniqueSlug(slugify(c.name.full), usedSlugs, c.id);
      const showTitle =
        linked.primary?.title.english || linked.primary?.title.romaji || null;

      const character = await upsertCharacter(store, {
        anilistId: c.id,
        slug,
        nameFull: c.name.full,
        nameFirst: c.name.first,
        nameLast: c.name.last,
        nameNative: c.name.native,
        image: c.image.large ?? c.image.medium,
        birthMonth: month,
        birthDay: day,
        favourites: c.favourites ?? 0,
        showId,
        alsoShowIds,
        wikiUrl: c.siteUrl,
        description: c.description,
        source: "anilist",
        ugcVolume: existing?.ugcVolume ?? null,
        ugcUpdatedAt: existing?.ugcUpdatedAt ?? null,
      });

      replaceHashtags(
        store,
        character.id,
        generateHashtags({
          nameFull: c.name.full,
          nameFirst: c.name.first,
          showTitle,
        }),
      );
      charactersUpserted++;
    }

    run.status = "success";
    run.charactersUpserted = charactersUpserted;
    run.showsUpserted = showsUpserted;
    run.finishedAt = new Date().toISOString();
    const syncedToPostgres = await persistStore(store);

    return {
      source: "saturate",
      charactersUpserted,
      showsUpserted,
      status: "success",
      syncedToPostgres,
      windowDays,
      matchedInWindow,
    };
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    try {
      await writeStore(store);
    } catch {
      /* ignore */
    }
    return {
      source: "saturate",
      charactersUpserted: 0,
      showsUpserted: 0,
      status: "error",
      error: run.error,
      windowDays,
      matchedInWindow: 0,
    };
  }
}

/** Map a raw AniList character into store shape without persistence (live fallback). */
export function mapAniListCharacter(c: AniListCharacter) {
  const media = pickPrimaryMedia(mediaWithRoles(c), c.name.full);
  const demos = media
    ? extractDemos(
        media.genres ?? [],
        (media.tags ?? []).map((t) => t.name),
      )
    : [];
  return {
    character: c,
    media,
    demos,
  };
}
