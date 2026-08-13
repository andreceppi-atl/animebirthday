import {
  fetchCharacterById,
  mediaWithRoles,
  pickCrossoverMedia,
  pickPrimaryMedia,
  type AniListMediaWithRole,
} from "@/lib/anilist/client";
import {
  loadWorkingStore,
  persistWorkingStore,
  replaceHashtags,
  upsertShow,
} from "@/lib/db/store";
import { generateHashtags } from "@/lib/tiktok/hashtags";
import { extractDemos } from "@/lib/utils";
import type { CharacterRecord, ShowRecord, StoreData } from "@/lib/types";

export type FactCheckIssue = {
  characterId: number;
  slug: string;
  nameFull: string;
  anilistId: number;
  currentShow: string | null;
  currentShowAnilistId: number | null;
  expectedShow: string;
  expectedShowAnilistId: number;
  expectedRole: string | null;
  currentRole: string | null;
  reason: string;
  /** Safe for auto-repair (cameo/missing). Soft disagreements stay report-only unless force. */
  autoRepairable: boolean;
};

export type FactCheckResult = {
  source: "factcheck";
  status: "success" | "error";
  checked: number;
  mismatches: number;
  repaired: number;
  skipped: number;
  issues: FactCheckIssue[];
  error?: string;
  syncedToPostgres?: boolean;
};

function showLabel(show: ShowRecord | null | undefined): string | null {
  if (!show) return null;
  return show.titleEnglish || show.titleRomaji;
}

function mediaLabel(m: AniListMediaWithRole): string {
  return m.title.english || m.title.romaji;
}

/**
 * Compare stored character→show links against AniList MAIN-role truth.
 * When repair=true, rewrite mismatched showIds using role-aware primary media.
 */
export async function factCheckCharacterShows(options?: {
  repair?: boolean;
  /** Repair soft mismatches too (season / flagship disagreements). Default: only cameos/missing. */
  force?: boolean;
  limit?: number;
  delayMs?: number;
  /** Only check characters whose favourites are at least this high */
  minFavourites?: number;
}): Promise<FactCheckResult> {
  const repair = options?.repair ?? false;
  const force = options?.force ?? false;
  const delayMs = options?.delayMs ?? 2100;
  const minFavourites = options?.minFavourites ?? 0;

  try {
    const store = await loadWorkingStore();
    const showMap = new Map(store.shows.map((s) => [s.id, s]));

    let candidates = store.characters.filter(
      (c) => c.anilistId != null && c.favourites >= minFavourites,
    );
    // Highest-traffic characters first — catches Saiki-class errors sooner
    candidates.sort((a, b) => b.favourites - a.favourites);
    if (options?.limit != null) {
      candidates = candidates.slice(0, options.limit);
    }

    const issues: FactCheckIssue[] = [];
    let checked = 0;
    let repaired = 0;
    let skipped = 0;

    for (let i = 0; i < candidates.length; i++) {
      const character = candidates[i]!;
      const anilistId = character.anilistId!;
      if (i > 0 && i % 25 === 0) {
        console.log(
          `factcheck progress ${i}/${candidates.length} (mismatches=${issues.length}, repaired=${repaired})`,
        );
      }
      try {
        const remote = await fetchCharacterById(anilistId);
        checked++;
        if (!remote) {
          skipped++;
          await sleep(delayMs);
          continue;
        }

        const media = mediaWithRoles(remote);
        const expected = pickPrimaryMedia(media, character.nameFull);
        if (!expected) {
          skipped++;
          await sleep(delayMs);
          continue;
        }

        const currentShow = character.showId
          ? showMap.get(character.showId) ?? null
          : null;
        const currentAnilistId = currentShow?.anilistId ?? null;

        if (currentAnilistId === expected.id) {
          // Primary is correct — still attach distinct crossover/cameo shows.
          if (repair) {
            const filled = await fillCrossoverShows(
              store,
              showMap,
              character,
              expected,
              media,
            );
            if (filled) repaired++;
          }
          await sleep(delayMs);
          continue;
        }

        const currentEdge = currentAnilistId
          ? media.find((m) => m.id === currentAnilistId)
          : null;
        const autoRepairable = isAutoRepairable(currentShow, currentEdge);
        const reason = explainMismatch(currentShow, expected, media);
        const issue: FactCheckIssue = {
          characterId: character.id,
          slug: character.slug,
          nameFull: character.nameFull,
          anilistId,
          currentShow: showLabel(currentShow),
          currentShowAnilistId: currentAnilistId,
          expectedShow: mediaLabel(expected),
          expectedShowAnilistId: expected.id,
          expectedRole: expected.characterRole ?? null,
          currentRole: currentEdge?.characterRole ?? null,
          reason,
          autoRepairable,
        };
        issues.push(issue);
        console.log(
          `mismatch: ${character.slug}: ${issue.currentShow} → ${issue.expectedShow} [${autoRepairable ? "auto" : "soft"}] (${reason})`,
        );

        if (repair && (autoRepairable || force)) {
          await applyShowRepair(store, showMap, character, expected, media);
          repaired++;
        }
      } catch (err) {
        skipped++;
        console.warn(
          `factcheck: failed for ${character.slug}:`,
          err instanceof Error ? err.message : err,
        );
      }
      await sleep(delayMs);
    }

    let syncedToPostgres = false;
    if (repair && repaired > 0) {
      syncedToPostgres = await persistWorkingStore(store);
    }

    return {
      source: "factcheck",
      status: "success",
      checked,
      mismatches: issues.length,
      repaired,
      skipped,
      issues,
      syncedToPostgres,
    };
  } catch (err) {
    return {
      source: "factcheck",
      status: "error",
      checked: 0,
      mismatches: 0,
      repaired: 0,
      skipped: 0,
      issues: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isAutoRepairable(
  current: ShowRecord | null,
  currentEdge: { characterRole?: string } | null | undefined,
): boolean {
  if (!current?.anilistId) return true;
  if (!currentEdge) return true; // stored show not on AniList media list
  if (currentEdge.characterRole === "BACKGROUND") return true;
  return false;
}

function explainMismatch(
  current: ShowRecord | null,
  expected: AniListMediaWithRole,
  all: AniListMediaWithRole[],
): string {
  const currentEdge = current?.anilistId
    ? all.find((m) => m.id === current.anilistId)
    : null;
  if (currentEdge?.characterRole === "BACKGROUND" && expected.characterRole === "MAIN") {
    return "Stored show is a BACKGROUND cameo; MAIN series exists";
  }
  if (!current) return "Character had no linked show; MAIN series found";
  if (currentEdge?.characterRole && expected.characterRole) {
    return `Role/popularity mismatch: stored=${currentEdge.characterRole}, expected=${expected.characterRole}`;
  }
  return "AniList role-aware primary media differs from stored show";
}

async function upsertCrossoverShowIds(
  store: StoreData,
  showMap: Map<number, ShowRecord>,
  primaryShowId: number,
  expected: AniListMediaWithRole,
  allMedia: AniListMediaWithRole[],
): Promise<number[]> {
  const alsoShowIds: number[] = [];
  for (const crossover of pickCrossoverMedia(allMedia, expected)) {
    const cTagNames = (crossover.tags ?? []).map((t) => t.name);
    const cShow = await upsertShow(store, {
      anilistId: crossover.id,
      titleRomaji: crossover.title.romaji,
      titleEnglish: crossover.title.english,
      titleNative: crossover.title.native,
      coverImage: crossover.coverImage.large ?? crossover.coverImage.medium,
      genres: crossover.genres ?? [],
      demos: extractDemos(crossover.genres ?? [], cTagNames),
      popularity: crossover.popularity ?? 0,
      favourites: crossover.favourites ?? 0,
      siteUrl: crossover.siteUrl,
    });
    showMap.set(cShow.id, cShow);
    if (cShow.id !== primaryShowId) alsoShowIds.push(cShow.id);
  }
  return alsoShowIds;
}

/** Attach crossover/cameo shows when primary is already correct. */
async function fillCrossoverShows(
  store: StoreData,
  showMap: Map<number, ShowRecord>,
  character: CharacterRecord,
  expected: AniListMediaWithRole,
  allMedia: AniListMediaWithRole[],
): Promise<boolean> {
  if (!character.showId) return false;
  const alsoShowIds = await upsertCrossoverShowIds(
    store,
    showMap,
    character.showId,
    expected,
    allMedia,
  );
  const prev = [...(character.alsoShowIds ?? [])].sort((a, b) => a - b);
  const next = [...alsoShowIds].sort((a, b) => a - b);
  if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
    return false;
  }
  character.alsoShowIds = alsoShowIds;
  character.updatedAt = new Date().toISOString();
  console.log(
    `crossover: ${character.slug}: also ${alsoShowIds.length} show(s)`,
  );
  return true;
}

async function applyShowRepair(
  store: StoreData,
  showMap: Map<number, ShowRecord>,
  character: CharacterRecord,
  expected: AniListMediaWithRole,
  allMedia: AniListMediaWithRole[],
) {
  const tagNames = (expected.tags ?? []).map((t) => t.name);
  const demos = extractDemos(expected.genres ?? [], tagNames);
  const show = await upsertShow(store, {
    anilistId: expected.id,
    titleRomaji: expected.title.romaji,
    titleEnglish: expected.title.english,
    titleNative: expected.title.native,
    coverImage: expected.coverImage.large ?? expected.coverImage.medium,
    genres: expected.genres ?? [],
    demos,
    popularity: expected.popularity ?? 0,
    favourites: expected.favourites ?? 0,
    siteUrl: expected.siteUrl,
  });
  showMap.set(show.id, show);

  const alsoShowIds = await upsertCrossoverShowIds(
    store,
    showMap,
    show.id,
    expected,
    allMedia,
  );

  character.showId = show.id;
  character.alsoShowIds = alsoShowIds;
  character.updatedAt = new Date().toISOString();

  replaceHashtags(
    store,
    character.id,
    generateHashtags({
      nameFull: character.nameFull,
      nameFirst: character.nameFirst,
      showTitle: show.titleEnglish || show.titleRomaji,
    }),
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
