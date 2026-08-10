import { promises as fs } from "fs";
import path from "path";
import type {
  CharacterRecord,
  HashtagRecord,
  IngestRunRecord,
  ShowRecord,
  StoreData,
  TiktokVideoRecord,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function emptyStore(): StoreData {
  return {
    shows: [],
    characters: [],
    hashtags: [],
    tiktokVideos: [],
    ingestRuns: [],
    nextIds: {
      shows: 1,
      characters: 1,
      hashtags: 1,
      tiktokVideos: 1,
      ingestRuns: 1,
    },
  };
}

export async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as StoreData;
  } catch {
    return emptyStore();
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
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
    wikiUrl: input.wikiUrl,
    description: input.description,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
  store.characters.push(character);
  return character;
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
