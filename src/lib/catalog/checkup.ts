import { fetchCharacterById } from "@/lib/anilist/client";
import {
  enrichWikiStubs,
  ensurePriorityCharacters,
  mergeDuplicateWikiStubs,
  refreshAniListFields,
} from "@/lib/catalog/refresh";
import { crawlShowRosters } from "@/lib/catalog/crawl";
import {
  addIngestRun,
  loadWorkingStore,
  persistWorkingStore,
} from "@/lib/db/store";
import { stampUpcomingUgc } from "@/lib/chartex/stamp";
import { hasDatabaseUrl } from "@/lib/db";
import { pgCharacterCount, pgGetAllMoments } from "@/lib/db/postgres";

export type CheckupReport = {
  source: "checkup";
  status: "success" | "error";
  charactersUpserted: number;
  showsUpserted: number;
  momentsUpserted?: number;
  error?: string;
  syncedToPostgres?: boolean;
  healthy: boolean;
  metrics: {
    characters: number;
    moments: number;
    wikiStubs: number;
    withImage: number;
    withUgc: number;
    momentUgc: number;
    nameDupes: number;
    nameDobDupes: number;
    anilistIdDupes: number;
    pgCharacters: number | null;
    pgMoments: number | null;
    enjinFavs: number | null;
    enjinRemoteFavs: number | null;
    enjinDelta: number | null;
    lastSources: string[];
  };
  actions: {
    mergedStubs: number;
    fieldsUpdated: number;
    stubsEnriched: number;
    priorityTouched: number;
    rosterTouched: number;
    ugcCharacters: number;
    ugcMoments: number;
  };
};

function countNameDupes(
  characters: Array<{ nameFull: string }>,
): number {
  const counts = new Map<string, number>();
  for (const c of characters) {
    const k = c.nameFull.toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.values()].filter((n) => n > 1).length;
}

function countNameDobDupes(
  characters: Array<{ nameFull: string; birthMonth: number; birthDay: number }>,
): number {
  const counts = new Map<string, number>();
  for (const c of characters) {
    const k = `${c.nameFull.toLowerCase()}|${c.birthMonth}|${c.birthDay}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.values()].filter((n) => n > 1).length;
}

function countAnilistIdDupes(
  characters: Array<{ anilistId: number | null }>,
): number {
  const counts = new Map<number, number>();
  for (const c of characters) {
    if (c.anilistId == null) continue;
    counts.set(c.anilistId, (counts.get(c.anilistId) || 0) + 1);
  }
  return [...counts.values()].filter((n) => n > 1).length;
}

/** Close any ingest runs left stuck in "running" from timed-out crons. */
function finalizeStuckRuns(store: Awaited<ReturnType<typeof loadWorkingStore>>) {
  const now = new Date().toISOString();
  for (const run of store.ingestRuns) {
    if (run.status === "running") {
      run.status = "error";
      run.error = run.error || "Marked incomplete by checkup (likely timeout)";
      run.finishedAt = run.finishedAt || now;
    }
  }
}

/**
 * Recurring health scan: measure coverage, merge stubs, refresh a slice of
 * AniList fields, enrich wiki gaps, and top up UGC when thin.
 */
export async function runCatalogCheckup(options?: {
  refreshLimit?: number;
  enrichLimit?: number;
  ugcCharacterLimit?: number;
  ugcMomentLimit?: number;
  /** Always stamp UGC even if coverage looks fine */
  forceUgc?: boolean;
}): Promise<CheckupReport> {
  const refreshLimit = options?.refreshLimit ?? 80;
  const enrichLimit = options?.enrichLimit ?? 30;
  const ugcCharacterLimit = options?.ugcCharacterLimit ?? 30;
  const ugcMomentLimit = options?.ugcMomentLimit ?? 15;
  const forceUgc = options?.forceUgc ?? false;

  const store = await loadWorkingStore();
  finalizeStuckRuns(store);
  const run = addIngestRun(store, {
    source: "checkup",
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
      limit: refreshLimit,
      delayMs: 550,
    });
    const mergedAfter = mergeDuplicateWikiStubs(store);
    const stubsEnriched = await enrichWikiStubs(store, {
      limit: enrichLimit,
      delayMs: 650,
    });
    const priorityTouched = await ensurePriorityCharacters(store, {
      delayMs: 650,
    });
    const roster = await crawlShowRosters(store, {
      showLimit: 5,
      maxNewFetches: 12,
      delayMs: 550,
    });
    const rosterTouched = roster.charactersUpserted;

    // Persist AniList/wiki repairs before UGC (stamp reads from Postgres/store)
    await persistWorkingStore(store);

    const withUgc = store.characters.filter((c) => c.ugcVolume != null).length;
    const momentUgc = store.moments.filter((m) => m.ugcVolume != null).length;
    const shouldStampUgc = forceUgc || withUgc < 25 || momentUgc < 15;

    let ugcCharacters = 0;
    let ugcMoments = 0;
    if (shouldStampUgc) {
      const ugc = await stampUpcomingUgc({
        characterLimit: ugcCharacterLimit,
        momentLimit: ugcMomentLimit,
      });
      if (ugc.status === "success") {
        ugcCharacters = ugc.charactersUpserted;
        ugcMoments = ugc.momentsUpserted;
      }
      // Reload character/moment UGC without dropping this checkup run
      const fresh = await loadWorkingStore();
      store.characters = fresh.characters;
      store.moments = fresh.moments;
      store.shows = fresh.shows;
      store.hashtags = fresh.hashtags;
      store.tiktokVideos = fresh.tiktokVideos;
      store.nextIds = fresh.nextIds;
      // Keep our in-progress checkup run + any newer runs from stamp
      const byId = new Map(store.ingestRuns.map((r) => [r.id, r]));
      for (const r of fresh.ingestRuns) byId.set(r.id, r);
      byId.set(run.id, run);
      store.ingestRuns = [...byId.values()].sort((a, b) => a.id - b.id);
    }

    // Re-load metrics after mutations (store is mutated in place)
    const enjin = store.characters.find(
      (c) => c.slug === "enjin" || c.anilistId === 266438,
    );
    let enjinRemoteFavs: number | null = null;
    if (enjin?.anilistId) {
      try {
        const remote = await fetchCharacterById(enjin.anilistId);
        enjinRemoteFavs = remote?.favourites ?? null;
        if (
          remote &&
          typeof remote.favourites === "number" &&
          remote.favourites !== enjin.favourites
        ) {
          enjin.favourites = remote.favourites;
          enjin.image = remote.image.large ?? remote.image.medium ?? enjin.image;
          enjin.updatedAt = new Date().toISOString();
        }
      } catch {
        /* non-fatal */
      }
    }

    let pgCharacters: number | null = null;
    let pgMoments: number | null = null;
    if (hasDatabaseUrl()) {
      try {
        pgCharacters = await pgCharacterCount();
        pgMoments = (await pgGetAllMoments()).length;
      } catch {
        /* non-fatal */
      }
    }

    const wikiStubs = store.characters.filter((c) => !c.anilistId).length;
    const withImage = store.characters.filter((c) => c.image).length;
    const nameDupes = countNameDupes(store.characters);
    const nameDobDupes = countNameDobDupes(store.characters);
    const anilistIdDupes = countAnilistIdDupes(store.characters);

    run.status = "success";
    run.charactersUpserted =
      mergedStubs +
      mergedAfter +
      fieldsUpdated +
      stubsEnriched +
      priorityTouched +
      rosterTouched +
      ugcCharacters;
    run.finishedAt = new Date().toISOString();

    const actions = {
      mergedStubs: mergedStubs + mergedAfter,
      fieldsUpdated,
      stubsEnriched,
      priorityTouched,
      rosterTouched,
      ugcCharacters,
      ugcMoments,
    };

    const syncedToPostgres = await persistWorkingStore(store);

    // Re-read Neon after persist so healed moments are reflected
    if (hasDatabaseUrl()) {
      try {
        pgCharacters = await pgCharacterCount();
        pgMoments = (await pgGetAllMoments()).length;
      } catch {
        /* non-fatal */
      }
    }

    const metrics = {
      characters: store.characters.length,
      moments: store.moments.length,
      wikiStubs,
      withImage,
      withUgc: store.characters.filter((c) => c.ugcVolume != null).length,
      momentUgc: store.moments.filter((m) => m.ugcVolume != null).length,
      nameDupes,
      nameDobDupes,
      anilistIdDupes,
      pgCharacters,
      pgMoments,
      enjinFavs: enjin?.favourites ?? null,
      enjinRemoteFavs,
      enjinDelta:
        enjinRemoteFavs != null && enjin
          ? enjinRemoteFavs - enjin.favourites
          : null,
      lastSources: store.ingestRuns
        .slice(-8)
        .map((r) => `${r.source}:${r.status}`),
    };

    const recentOk = store.ingestRuns
      .slice(-12)
      .filter((r) => r.status === "success")
      .map((r) => r.source);
    const hasRecentAniList = recentOk.some((s) =>
      ["anilist", "refresh", "checkup", "roster", "saturate"].includes(s),
    );

    const healthy =
      metrics.nameDupes === 0 &&
      metrics.nameDobDupes === 0 &&
      metrics.anilistIdDupes === 0 &&
      metrics.moments >= 100 &&
      metrics.characters >= 400 &&
      metrics.wikiStubs < 40 &&
      (metrics.pgMoments == null || metrics.pgMoments >= 100) &&
      (metrics.pgCharacters == null ||
        Math.abs(metrics.pgCharacters - metrics.characters) < 25) &&
      (metrics.enjinDelta == null || Math.abs(metrics.enjinDelta) < 50) &&
      hasRecentAniList;

    const report: CheckupReport = {
      source: "checkup",
      status: "success",
      charactersUpserted: run.charactersUpserted,
      showsUpserted: 0,
      momentsUpserted: ugcMoments,
      syncedToPostgres,
      healthy,
      metrics,
      actions,
    };

    return report;
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.finishedAt = new Date().toISOString();
    await persistWorkingStore(store);
    return {
      source: "checkup",
      status: "error",
      charactersUpserted: 0,
      showsUpserted: 0,
      error: run.error,
      healthy: false,
      metrics: {
        characters: 0,
        moments: 0,
        wikiStubs: 0,
        withImage: 0,
        withUgc: 0,
        momentUgc: 0,
        nameDupes: 0,
        nameDobDupes: 0,
        anilistIdDupes: 0,
        pgCharacters: null,
        pgMoments: null,
        enjinFavs: null,
        enjinRemoteFavs: null,
        enjinDelta: null,
        lastSources: [],
      },
      actions: {
        mergedStubs: 0,
        fieldsUpdated: 0,
        stubsEnriched: 0,
        priorityTouched: 0,
        rosterTouched: 0,
        ugcCharacters: 0,
        ugcMoments: 0,
      },
    };
  }
}
