import {
  fetchCharacterById,
  searchCharactersByName,
  type AniListCharacter,
} from "@/lib/anilist/client";
import { linkShowsForAniListCharacter } from "@/lib/anilist/linkShows";
import {
  addIngestRun,
  loadWorkingStore,
  persistWorkingStore,
  removeCharacter,
  replaceHashtags,
  upsertCharacter,
} from "@/lib/db/store";
import { generateHashtags } from "@/lib/tiktok/hashtags";
import { daysUntilBirthday, slugify } from "@/lib/utils";
import type { CharacterRecord, StoreData } from "@/lib/types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nameKey(name: string) {
  return slugify(name);
}

/**
 * Prefer clean slug (`enjin`) over id-suffixed (`enjin-266438`) when merging.
 */
function preferCanonicalSlug(
  store: StoreData,
  keeper: CharacterRecord,
  stub: CharacterRecord,
) {
  const base = nameKey(keeper.nameFull);
  const stubIsClean = stub.slug === base || !/-\d+$/.test(stub.slug);
  const keeperIsSuffixed =
    keeper.slug === `${base}-${keeper.anilistId}` || /-\d+$/.test(keeper.slug);
  if (stubIsClean && keeperIsSuffixed && stub.slug !== keeper.slug) {
    const desired = stub.slug;
    stub.slug = `${stub.slug}-merged-${stub.id}`;
    keeper.slug = desired;
  }
  if (stub.wikiUrl && !keeper.wikiUrl) keeper.wikiUrl = stub.wikiUrl;
}

function mergeStubIntoKeeper(
  store: StoreData,
  keeper: CharacterRecord,
  stub: CharacterRecord,
) {
  preferCanonicalSlug(store, keeper, stub);
  // Move stub hashtags only if keeper has none
  const keeperTags = store.hashtags.filter((h) => h.characterId === keeper.id);
  if (!keeperTags.length) {
    for (const h of store.hashtags) {
      if (h.characterId === stub.id) h.characterId = keeper.id;
    }
  }
  for (const v of store.tiktokVideos) {
    if (v.characterId === stub.id) v.characterId = keeper.id;
  }
  removeCharacter(store, stub.id);
  keeper.updatedAt = new Date().toISOString();
}

/** Collapse wiki stubs that duplicate an AniList character (same name + birthday). */
export function mergeDuplicateWikiStubs(store: StoreData): number {
  let merged = 0;
  const anilist = store.characters.filter((c) => c.anilistId != null);
  const stubs = store.characters.filter(
    (c) => !c.anilistId && c.source === "wiki",
  );

  for (const stub of [...stubs]) {
    if (!store.characters.some((c) => c.id === stub.id)) continue;
    const match = anilist.find(
      (a) =>
        nameKey(a.nameFull) === nameKey(stub.nameFull) &&
        a.birthMonth === stub.birthMonth &&
        a.birthDay === stub.birthDay,
    );
    if (!match) continue;
    mergeStubIntoKeeper(store, match, stub);
    merged++;
    // #region agent log
    fetch("http://127.0.0.1:7341/ingest/dc4cd831-aa81-49f1-bb19-7b91d027aad0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "ad8825",
      },
      body: JSON.stringify({
        sessionId: "ad8825",
        runId: "refresh-fix",
        hypothesisId: "A",
        location: "refresh.ts:mergeDuplicateWikiStubs",
        message: "merged wiki stub",
        data: {
          stubSlug: stub.slug,
          keeperSlug: match.slug,
          name: match.nameFull,
          favs: match.favourites,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }
  return merged;
}

async function applyAniListFields(
  store: StoreData,
  character: CharacterRecord,
  remote: AniListCharacter,
  options?: { relinkShows?: boolean },
) {
  let showId = character.showId;
  let alsoShowIds = character.alsoShowIds ?? [];
  let showTitle: string | null = null;

  if (options?.relinkShows || !showId) {
    const linked = await linkShowsForAniListCharacter(store, remote);
    showId = linked.showId ?? showId;
    if (linked.alsoShowIds.length) alsoShowIds = linked.alsoShowIds;
    showTitle =
      linked.primary?.title.english || linked.primary?.title.romaji || null;
  }

  await upsertCharacter(store, {
    anilistId: remote.id,
    slug: character.slug,
    nameFull: remote.name.full,
    nameFirst: remote.name.first,
    nameLast: remote.name.last,
    nameNative: remote.name.native,
    image: remote.image.large ?? remote.image.medium,
    birthMonth: remote.dateOfBirth.month ?? character.birthMonth,
    birthDay: remote.dateOfBirth.day ?? character.birthDay,
    favourites: remote.favourites ?? 0,
    showId,
    alsoShowIds,
    wikiUrl: character.wikiUrl || remote.siteUrl,
    description: remote.description,
    source: "anilist",
    ugcVolume: character.ugcVolume,
    ugcUpdatedAt: character.ugcUpdatedAt,
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
}

/**
 * Re-fetch AniList favourites / images / DOB for existing linked characters.
 * Prefers upcoming birthdays so the feed stays fresh under cron time limits.
 */
export async function refreshAniListFields(
  store: StoreData,
  options?: { limit?: number; delayMs?: number; upcomingDays?: number },
): Promise<number> {
  const limit = options?.limit ?? 200;
  const delayMs = options?.delayMs ?? 650;
  const upcomingDays = options?.upcomingDays ?? 90;

  const linked = store.characters
    .filter((c) => c.anilistId != null)
    .map((c) => ({
      c,
      days: daysUntilBirthday(c.birthMonth, c.birthDay),
    }))
    .sort((a, b) => {
      const aSoon = a.days >= 0 && a.days <= upcomingDays ? 0 : 1;
      const bSoon = b.days >= 0 && b.days <= upcomingDays ? 0 : 1;
      if (aSoon !== bSoon) return aSoon - bSoon;
      return b.c.favourites - a.c.favourites;
    });

  let updated = 0;
  for (const { c } of linked.slice(0, limit)) {
    try {
      const remote = await fetchCharacterById(c.anilistId!);
      if (!remote) continue;
      const before = {
        favs: c.favourites,
        image: c.image,
        month: c.birthMonth,
        day: c.birthDay,
      };
      await applyAniListFields(store, c, remote);
      const changed =
        before.favs !== (remote.favourites ?? 0) ||
        before.image !== (remote.image.large ?? remote.image.medium) ||
        before.month !== (remote.dateOfBirth.month ?? before.month) ||
        before.day !== (remote.dateOfBirth.day ?? before.day);
      if (changed) updated++;
    } catch (err) {
      console.warn(
        `refresh: failed ${c.slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
    await sleep(delayMs);
  }
  return updated;
}

/**
 * Search AniList for wiki-only stubs and upgrade them when name+birthday match.
 */
export async function enrichWikiStubs(
  store: StoreData,
  options?: { limit?: number; delayMs?: number },
): Promise<number> {
  const limit = options?.limit ?? 40;
  const delayMs = options?.delayMs ?? 800;
  const stubs = store.characters.filter(
    (c) => !c.anilistId && c.source === "wiki",
  );
  let enriched = 0;

  for (const stub of stubs.slice(0, limit)) {
    try {
      const results = await searchCharactersByName(stub.nameFull);
      const match =
        results.find(
          (r) =>
            nameKey(r.name.full) === nameKey(stub.nameFull) &&
            r.dateOfBirth?.month === stub.birthMonth &&
            r.dateOfBirth?.day === stub.birthDay,
        ) ??
        results.find(
          (r) =>
            nameKey(r.name.full) === nameKey(stub.nameFull) &&
            r.dateOfBirth?.month &&
            r.dateOfBirth?.day,
        );

      if (!match?.dateOfBirth?.month || !match.dateOfBirth?.day) {
        await sleep(delayMs);
        continue;
      }

      // Already have this AniList id → merge stub into existing
      const existing = store.characters.find((c) => c.anilistId === match.id);
      if (existing) {
        mergeStubIntoKeeper(store, existing, stub);
        enriched++;
        await sleep(delayMs);
        continue;
      }

      stub.anilistId = match.id;
      stub.source = "anilist";
      await applyAniListFields(store, stub, match, { relinkShows: true });
      enriched++;
    } catch (err) {
      console.warn(
        `enrich: failed ${stub.slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
    await sleep(delayMs);
  }
  return enriched;
}

export type RefreshCatalogResult = {
  source: "refresh";
  status: "success" | "error";
  charactersUpserted: number;
  showsUpserted: number;
  error?: string;
  syncedToPostgres?: boolean;
  mergedStubs?: number;
  fieldsUpdated?: number;
  stubsEnriched?: number;
};

/**
 * Daily catalog polish: merge wiki duplicates, refresh AniList fields, enrich stubs.
 */
export async function refreshCatalog(options?: {
  refreshLimit?: number;
  enrichLimit?: number;
}): Promise<RefreshCatalogResult> {
  const store = await loadWorkingStore();
  const run = addIngestRun(store, {
    source: "refresh",
    status: "running",
    charactersUpserted: 0,
    showsUpserted: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  try {
    const mergedStubs = mergeDuplicateWikiStubs(store);
    const fieldsUpdated = await refreshAniListFields(store, {
      limit: options?.refreshLimit ?? 180,
    });
    // Re-merge after field refresh in case new name/dob alignments appear
    const mergedAfter = mergeDuplicateWikiStubs(store);
    const stubsEnriched = await enrichWikiStubs(store, {
      limit: options?.enrichLimit ?? 35,
    });
    const mergedStubsTotal = mergedStubs + mergedAfter;

    run.status = "success";
    run.charactersUpserted =
      fieldsUpdated + stubsEnriched + mergedStubsTotal;
    run.finishedAt = new Date().toISOString();
    const syncedToPostgres = await persistWorkingStore(store);

    // #region agent log
    fetch("http://127.0.0.1:7341/ingest/dc4cd831-aa81-49f1-bb19-7b91d027aad0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "ad8825",
      },
      body: JSON.stringify({
        sessionId: "ad8825",
        runId: "refresh-fix",
        hypothesisId: "E",
        location: "refresh.ts:refreshCatalog",
        message: "refresh complete",
        data: {
          mergedStubs: mergedStubsTotal,
          fieldsUpdated,
          stubsEnriched,
          syncedToPostgres,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return {
      source: "refresh",
      status: "success",
      charactersUpserted: run.charactersUpserted,
      showsUpserted: 0,
      syncedToPostgres,
      mergedStubs: mergedStubsTotal,
      fieldsUpdated,
      stubsEnriched,
    };
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    await persistWorkingStore(store);
    return {
      source: "refresh",
      status: "error",
      charactersUpserted: 0,
      showsUpserted: 0,
      error: run.error,
    };
  }
}
