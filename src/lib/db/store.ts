import { promises as fs } from "fs";
import path from "path";
import type {
  CharacterRecord,
  HashtagRecord,
  IngestRunRecord,
  MomentRecord,
  ShowRecord,
  StoreData,
  TiktokVideoRecord,
} from "@/lib/types";
import {
  hasDatabaseUrl,
  loadStoreFromPostgres,
  syncStoreToPostgres,
} from "@/lib/db/postgres";
import { normalizeMomentKind } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

/** Stores that were healed with JSON moments and should force a Neon rewrite. */
const hydratedMomentsStores = new WeakSet<object>();

function emptyStore(): StoreData {
  return {
    shows: [],
    characters: [],
    hashtags: [],
    tiktokVideos: [],
    moments: [],
    ingestRuns: [],
    nextIds: {
      shows: 1,
      characters: 1,
      hashtags: 1,
      tiktokVideos: 1,
      moments: 1,
      ingestRuns: 1,
    },
  };
}

export async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const data = JSON.parse(raw) as StoreData;
    if (!data.moments) data.moments = [];
    if (!data.nextIds.moments) data.nextIds.moments = 1;
    if (!data.nextIds.ingestRuns) data.nextIds.ingestRuns = 1;
    for (const c of data.characters) {
      if (c.ugcVolume === undefined) c.ugcVolume = null;
      if (c.ugcUpdatedAt === undefined) c.ugcUpdatedAt = null;
      if (!Array.isArray(c.alsoShowIds)) c.alsoShowIds = [];
    }
    for (const m of data.moments) {
      if (m.ugcVolume === undefined) m.ugcVolume = null;
      if (m.ugcUpdatedAt === undefined) m.ugcUpdatedAt = null;
      if (!m.tags) m.tags = [];
    }
    return data;
  } catch {
    return emptyStore();
  }
}

/**
 * Working store for ingest/mutations.
 * When DATABASE_URL is set and Neon already has catalog rows, Postgres is the authority
 * (avoids Vercel cron wiping Neon from an ephemeral empty store.json).
 * If Neon has characters but zero moments, hydrate moments from local JSON so
 * AniList-only syncs cannot permanently drop the moments catalog.
 */
export async function loadWorkingStore(): Promise<StoreData> {
  if (hasDatabaseUrl()) {
    try {
      const fromPg = await loadStoreFromPostgres();
      if (fromPg.characters.length > 0 || fromPg.moments.length > 0) {
        if (fromPg.moments.length === 0) {
          const json = await readStore();
          if (json.moments.length > 0) {
            fromPg.moments = json.moments;
            fromPg.nextIds.moments =
              Math.max(0, ...json.moments.map((m) => m.id)) + 1;
            hydratedMomentsStores.add(fromPg);
          }
        }
        return fromPg;
      }
    } catch (err) {
      console.warn("loadWorkingStore: Postgres load failed, using JSON", err);
    }
  }
  return readStore();
}

export async function writeStore(data: StoreData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

/** Persist working store: always attempt JSON write; sync full catalog to Neon when configured. */
export async function persistWorkingStore(store: StoreData): Promise<boolean> {
  const hydrated = hydratedMomentsStores.has(store);
  try {
    await writeStore(store);
  } catch (err) {
    // Ephemeral serverless FS may be read-only — Neon sync is what matters in prod
    console.warn("persistWorkingStore: JSON write skipped", err);
  }
  if (!hasDatabaseUrl()) return false;
  await syncStoreToPostgres(store);
  if (hydrated) {
    hydratedMomentsStores.delete(store);
    console.warn(
      `persistWorkingStore: re-synced ${store.moments.length} hydrated moments to Neon`,
    );
  }
  return true;
}

export async function upsertShow(
  store: StoreData,
  input: Omit<ShowRecord, "id" | "createdAt" | "updatedAt"> & {
    id?: number;
  },
): Promise<ShowRecord> {
  const now = new Date().toISOString();
  const existing = input.anilistId
    ? store.shows.find((s) => s.anilistId === input.anilistId)
    : input.id
      ? store.shows.find((s) => s.id === input.id)
      : undefined;

  if (existing) {
    Object.assign(existing, {
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    return existing;
  }

  const show: ShowRecord = {
    id: store.nextIds.shows++,
    anilistId: input.anilistId,
    titleRomaji: input.titleRomaji,
    titleEnglish: input.titleEnglish,
    titleNative: input.titleNative,
    coverImage: input.coverImage,
    genres: input.genres,
    demos: input.demos,
    popularity: input.popularity,
    favourites: input.favourites,
    siteUrl: input.siteUrl,
    createdAt: now,
    updatedAt: now,
  };
  store.shows.push(show);
  return show;
}

export async function upsertCharacter(
  store: StoreData,
  input: Omit<CharacterRecord, "id" | "createdAt" | "updatedAt"> & {
    id?: number;
  },
): Promise<CharacterRecord> {
  const now = new Date().toISOString();
  const existing =
    (input.anilistId
      ? store.characters.find((c) => c.anilistId === input.anilistId)
      : undefined) ??
    store.characters.find((c) => c.slug === input.slug);

  if (existing) {
    Object.assign(existing, {
      ...input,
      alsoShowIds: input.alsoShowIds ?? existing.alsoShowIds ?? [],
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    return existing;
  }

  const character: CharacterRecord = {
    id: store.nextIds.characters++,
    anilistId: input.anilistId,
    slug: input.slug,
    nameFull: input.nameFull,
    nameFirst: input.nameFirst,
    nameLast: input.nameLast,
    nameNative: input.nameNative,
    image: input.image,
    birthMonth: input.birthMonth,
    birthDay: input.birthDay,
    favourites: input.favourites,
    showId: input.showId,
    alsoShowIds: input.alsoShowIds ?? [],
    wikiUrl: input.wikiUrl,
    description: input.description,
    source: input.source,
    ugcVolume: input.ugcVolume ?? null,
    ugcUpdatedAt: input.ugcUpdatedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.characters.push(character);
  return character;
}

export function setCharacterUgc(
  store: StoreData,
  characterId: number,
  ugcVolume: number,
) {
  const c = store.characters.find((x) => x.id === characterId);
  if (!c) return;
  c.ugcVolume = ugcVolume;
  c.ugcUpdatedAt = new Date().toISOString();
  c.updatedAt = c.ugcUpdatedAt;
}

export function replaceHashtags(
  store: StoreData,
  characterId: number,
  tags: Array<{ tag: string; kind: string }>,
) {
  store.hashtags = store.hashtags.filter((h) => h.characterId !== characterId);
  for (const t of tags) {
    const record: HashtagRecord = {
      id: store.nextIds.hashtags++,
      characterId,
      tag: t.tag,
      kind: t.kind,
    };
    store.hashtags.push(record);
  }
}

/** Remove a character and dependent hashtags / tiktok rows from the working store. */
export function removeCharacter(store: StoreData, characterId: number) {
  store.characters = store.characters.filter((c) => c.id !== characterId);
  store.hashtags = store.hashtags.filter((h) => h.characterId !== characterId);
  store.tiktokVideos = store.tiktokVideos.filter(
    (v) => v.characterId !== characterId,
  );
}

export function addTiktokVideo(
  store: StoreData,
  input: Omit<TiktokVideoRecord, "id" | "createdAt">,
): TiktokVideoRecord {
  const existing = store.tiktokVideos.find(
    (v) => v.characterId === input.characterId && v.videoUrl === input.videoUrl,
  );
  if (existing) {
    Object.assign(existing, input);
    return existing;
  }
  const video: TiktokVideoRecord = {
    id: store.nextIds.tiktokVideos++,
    ...input,
    createdAt: new Date().toISOString(),
  };
  store.tiktokVideos.push(video);
  return video;
}

export function addIngestRun(
  store: StoreData,
  input: Omit<IngestRunRecord, "id">,
): IngestRunRecord {
  const run: IngestRunRecord = {
    id: store.nextIds.ingestRuns++,
    ...input,
  };
  store.ingestRuns.push(run);
  return run;
}

export async function upsertMoment(
  store: StoreData,
  input: Omit<MomentRecord, "id" | "createdAt" | "updatedAt"> & { id?: number },
): Promise<MomentRecord> {
  const now = new Date().toISOString();
  const kind = normalizeMomentKind(input.kind);
  const existing = store.moments.find((m) => m.slug === input.slug);
  if (existing) {
    Object.assign(existing, {
      ...input,
      kind,
      id: existing.id,
      ugcVolume: input.ugcVolume ?? existing.ugcVolume,
      ugcUpdatedAt: input.ugcUpdatedAt ?? existing.ugcUpdatedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    return existing;
  }
  const moment: MomentRecord = {
    id: store.nextIds.moments++,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    kind,
    franchise: input.franchise,
    image: input.image,
    month: input.month,
    day: input.day,
    year: input.year,
    significance: input.significance,
    wikiUrl: input.wikiUrl,
    source: input.source,
    tags: input.tags,
    ugcVolume: input.ugcVolume ?? null,
    ugcUpdatedAt: input.ugcUpdatedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.moments.push(moment);
  return moment;
}

export function setMomentUgc(
  store: StoreData,
  momentId: number,
  ugcVolume: number,
) {
  const m = store.moments.find((x) => x.id === momentId);
  if (!m) return;
  m.ugcVolume = ugcVolume;
  m.ugcUpdatedAt = new Date().toISOString();
  m.updatedAt = m.ugcUpdatedAt;
}
