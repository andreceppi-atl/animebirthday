import {
  fetchTopCharactersWithBirthdays,
  pickPrimaryMedia,
  type AniListCharacter,
} from "@/lib/anilist/client";
import {
  addIngestRun,
  readStore,
  replaceHashtags,
  upsertCharacter,
  upsertShow,
  writeStore,
} from "@/lib/db/store";
import { hasDatabaseUrl, syncStoreToPostgres } from "@/lib/db/postgres";
import { generateHashtags } from "@/lib/tiktok/hashtags";
import { extractDemos, slugify } from "@/lib/utils";
import { scrapeWikiBirthdays } from "@/lib/wiki/scrape";
import type { StoreData } from "@/lib/types";

export type IngestResult = {
  source: string;
  charactersUpserted: number;
  showsUpserted: number;
  status: "success" | "error";
  error?: string;
  syncedToPostgres?: boolean;
};

async function persistStore(store: StoreData): Promise<boolean> {
  await writeStore(store);
  if (!hasDatabaseUrl()) return false;
  await syncStoreToPostgres(store);
  return true;
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
  const store = await readStore();
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
      const media = pickPrimaryMedia(c.media?.nodes ?? []);
      let showId: number | null = null;

      if (media) {
        const tagNames = (media.tags ?? []).map((t) => t.name);
        const demos = extractDemos(media.genres ?? [], tagNames);
        const show = await upsertShow(store, {
          anilistId: media.id,
          titleRomaji: media.title.romaji,
          titleEnglish: media.title.english,
          titleNative: media.title.native,
          coverImage: media.coverImage.large ?? media.coverImage.medium,
          genres: media.genres ?? [],
          demos,
          popularity: media.popularity ?? 0,
          favourites: media.favourites ?? 0,
          siteUrl: media.siteUrl,
        });
        showId = show.id;
        showsUpserted++;
      }

      const baseSlug = slugify(c.name.full);
      // Reserve slug if new
      const existing = store.characters.find((x) => x.anilistId === c.id);
      const slug = existing?.slug ?? uniqueSlug(baseSlug, usedSlugs, c.id);

      const showTitle =
        media?.title.english || media?.title.romaji || null;

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
        wikiUrl: c.siteUrl,
        description: c.description,
        source: "anilist",
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
    await writeStore(store);
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
  const store = await readStore();
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
        wikiUrl: entry.wikiUrl,
        description: null,
        source: "wiki",
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
    await writeStore(store);
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
}): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  results.push(await ingestFromAniList({ maxPages: options?.maxPages }));
  if (options?.includeWiki !== false) {
    results.push(await ingestFromWiki());
  }
  return results;
}

/** Map a raw AniList character into store shape without persistence (live fallback). */
export function mapAniListCharacter(c: AniListCharacter) {
  const media = pickPrimaryMedia(c.media?.nodes ?? []);
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
