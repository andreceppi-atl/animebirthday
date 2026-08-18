import { searchChartexSongs, hasChartexCredentials } from "@/lib/chartex/client";
import {
  getUpcomingCharacters,
  updateCharacterUgc,
  updateMomentUgc,
} from "@/lib/queries";
import { loadWorkingStore } from "@/lib/db/store";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bestUgcForQuery(query: string): Promise<number | null> {
  const result = await searchChartexSongs(query, { limit: 5 });
  if (result.error || !result.results.length) return null;
  const best = result.results.reduce((a, b) =>
    b.ugcVolume > a.ugcVolume ? b : a,
  );
  return best.ugcVolume > 0 ? best.ugcVolume : null;
}

export type StampUgcResult = {
  source: "chartex";
  status: "success" | "error";
  charactersUpserted: number;
  showsUpserted: number;
  momentsUpserted: number;
  error?: string;
};

/**
 * Stamp ChartEx UGC volumes onto upcoming birthdays + significant moments.
 */
export async function stampUpcomingUgc(options?: {
  characterLimit?: number;
  momentLimit?: number;
  delayMs?: number;
}): Promise<StampUgcResult> {
  const characterLimit = options?.characterLimit ?? 40;
  const momentLimit = options?.momentLimit ?? 20;
  const delayMs = options?.delayMs ?? 400;

  if (!hasChartexCredentials()) {
    return {
      source: "chartex",
      status: "error",
      charactersUpserted: 0,
      showsUpserted: 0,
      momentsUpserted: 0,
      error: "ChartEx credentials missing",
    };
  }

  try {
    const upcoming = await getUpcomingCharacters({
      days: 60,
      limit: characterLimit,
      sort: "popularity",
      type: "birthday",
    });

    let charactersUpserted = 0;
    for (const item of upcoming) {
      const queries = [
        item.nameFull,
        item.show?.titleEnglish || item.show?.titleRomaji
          ? `${item.nameFull} ${item.show?.titleEnglish || item.show?.titleRomaji}`
          : null,
      ].filter(Boolean) as string[];

      let volume: number | null = null;
      for (const q of queries) {
        volume = await bestUgcForQuery(q);
        if (volume != null) break;
        await sleep(delayMs);
      }
      if (volume == null) {
        await sleep(delayMs / 2);
        continue;
      }
      await updateCharacterUgc(item.slug, volume);
      charactersUpserted++;
      await sleep(delayMs);
    }

    const store = await loadWorkingStore();
    const moments = [...(store.moments ?? [])]
      .filter(
        (m) =>
          (m.kind !== "release_anniversary" && m.kind !== "release") ||
          m.significance >= 90,
      )
      .sort((a, b) => b.significance - a.significance)
      .slice(0, momentLimit);

    let momentsUpserted = 0;
    for (const m of moments) {
      const q =
        m.franchise ||
        m.title.replace(/ premiere$/, "").replace(/ release$/, "");
      const volume = await bestUgcForQuery(q);
      if (volume == null) {
        await sleep(delayMs / 2);
        continue;
      }
      await updateMomentUgc(m.slug, volume);
      momentsUpserted++;
      await sleep(delayMs);
    }

    return {
      source: "chartex",
      status: "success",
      charactersUpserted,
      showsUpserted: 0,
      momentsUpserted,
    };
  } catch (err) {
    return {
      source: "chartex",
      status: "error",
      charactersUpserted: 0,
      showsUpserted: 0,
      momentsUpserted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
