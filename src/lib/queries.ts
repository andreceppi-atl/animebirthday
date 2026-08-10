import {
  addTiktokVideo,
  readStore,
  setCharacterUgc,
  setMomentUgc,
  writeStore,
} from "@/lib/db/store";
import {
  hasDatabaseUrl,
  pgAddTiktokVideo,
  pgCharacterCount,
  pgGetAllCharactersWithRelations,
  pgGetCharacterBySlug,
  syncStoreToPostgres,
} from "@/lib/db/postgres";
import type {
  CharacterWithShow,
  CharacterRecord,
  FeedKind,
  MomentKind,
  MomentRecord,
  ShowRecord,
} from "@/lib/types";
import { daysUntilBirthday, nextBirthdayDate } from "@/lib/utils";
import { fetchTikTokOEmbed, isValidTikTokUrl } from "@/lib/tiktok/oembed";

export type SortMode = "date" | "popularity" | "relevance" | "ugc";
export type TypeFilter = "birthday" | "moment" | "all";

export type UpcomingFilters = {
  days?: number;
  limit?: number;
  q?: string;
  sort?: SortMode;
  demo?: string;
  minFavourites?: number;
  type?: TypeFilter;
  momentKind?: MomentKind | "";
};

export type UpcomingItem = {
  feedKind: FeedKind;
  id: number;
  slug: string;
  nameFull: string;
  image: string | null;
  birthMonth: number;
  birthDay: number;
  favourites: number;
  daysUntil: number;
  nextDate: string;
  ugcScore: number;
  ugcEstimated: boolean;
  relevance: number;
  /** Moment-only */
  momentKind?: MomentKind;
  franchise?: string | null;
  summary?: string | null;
  year?: number | null;
  show: {
    titleEnglish: string | null;
    titleRomaji: string;
    demos: string[];
    genres: string[];
  } | null;
};

export async function getCharacterCount(): Promise<number> {
  if (hasDatabaseUrl()) {
    return pgCharacterCount();
  }
  const store = await readStore();
  return store.characters.length;
}

async function loadCharacters(): Promise<CharacterWithShow[]> {
  if (hasDatabaseUrl()) {
    return pgGetAllCharactersWithRelations();
  }
  const store = await readStore();
  const showMap = new Map(store.shows.map((s) => [s.id, s]));
  return store.characters.map((c) => ({
    ...c,
    show: c.showId ? showMap.get(c.showId) ?? null : null,
    hashtags: store.hashtags.filter((h) => h.characterId === c.id),
    tiktokVideos: store.tiktokVideos.filter((v) => v.characterId === c.id),
  }));
}

async function loadMoments(): Promise<MomentRecord[]> {
  const store = await readStore();
  return store.moments ?? [];
}

export function relevanceScore(input: {
  daysUntil: number;
  favourites: number;
  showPopularity?: number;
  significance?: number;
}): number {
  const recency = Math.max(0, 100 - input.daysUntil * 1.4);
  const fav = Math.log10(Math.max(input.favourites, 1)) * 18;
  const show = Math.log10(Math.max(input.showPopularity ?? 1, 1)) * 8;
  const sig = (input.significance ?? 0) * 0.35;
  return recency + fav + show + sig;
}

export function ugcScore(input: {
  ugcVolume: number | null;
  favourites: number;
}): { score: number; estimated: boolean } {
  if (input.ugcVolume != null && input.ugcVolume > 0) {
    return { score: input.ugcVolume, estimated: false };
  }
  return {
    score: Math.round(Math.pow(Math.max(input.favourites, 1), 1.15)),
    estimated: true,
  };
}

function characterToFeedItem(c: CharacterWithShow): UpcomingItem {
  const daysUntil = daysUntilBirthday(c.birthMonth, c.birthDay);
  const nextDate = nextBirthdayDate(c.birthMonth, c.birthDay);
  const ugc = ugcScore({ ugcVolume: c.ugcVolume, favourites: c.favourites });
  return {
    feedKind: "birthday",
    id: c.id,
    slug: c.slug,
    nameFull: c.nameFull,
    image: c.image,
    birthMonth: c.birthMonth,
    birthDay: c.birthDay,
    favourites: c.favourites,
    daysUntil,
    nextDate: nextDate.toISOString(),
    ugcScore: ugc.score,
    ugcEstimated: ugc.estimated,
    relevance: relevanceScore({
      daysUntil,
      favourites: c.favourites,
      showPopularity: c.show?.popularity,
    }),
    show: c.show
      ? {
          titleEnglish: c.show.titleEnglish,
          titleRomaji: c.show.titleRomaji,
          demos: c.show.demos,
          genres: c.show.genres,
        }
      : null,
  };
}

function momentToFeedItem(m: MomentRecord): UpcomingItem {
  const daysUntil = daysUntilBirthday(m.month, m.day);
  const nextDate = nextBirthdayDate(m.month, m.day);
  const popularityProxy = m.significance * 120;
  const ugc = ugcScore({
    ugcVolume: m.ugcVolume,
    favourites: popularityProxy,
  });
  return {
    feedKind: "moment",
    id: m.id,
    slug: m.slug,
    nameFull: m.title,
    image: m.image,
    birthMonth: m.month,
    birthDay: m.day,
    favourites: popularityProxy,
    daysUntil,
    nextDate: nextDate.toISOString(),
    ugcScore: ugc.score,
    ugcEstimated: ugc.estimated,
    relevance: relevanceScore({
      daysUntil,
      favourites: popularityProxy,
      significance: m.significance,
    }),
    momentKind: m.kind,
    franchise: m.franchise,
    summary: m.summary,
    year: m.year,
    show: m.franchise
      ? {
          titleEnglish: m.franchise,
          titleRomaji: m.franchise,
          demos: [],
          genres: m.tags.slice(0, 4),
        }
      : null,
  };
}

export async function getUpcomingCharacters(
  options?: UpcomingFilters,
): Promise<UpcomingItem[]> {
  const days = options?.days ?? 60;
  const limit = options?.limit ?? 80;
  const sort: SortMode = options?.sort ?? "relevance";
  const q = options?.q?.trim().toLowerCase() ?? "";
  const demo = options?.demo?.trim().toLowerCase() ?? "";
  const minFavourites = options?.minFavourites ?? 0;
  // Birthdays remain default — moments opt-in via type filter
  const type: TypeFilter = options?.type ?? "birthday";
  const momentKind = options?.momentKind ?? "";

  const [characters, moments] = await Promise.all([
    type === "moment" ? Promise.resolve([]) : loadCharacters(),
    type === "birthday" ? Promise.resolve([]) : loadMoments(),
  ]);

  let items: UpcomingItem[] = [
    ...characters.map(characterToFeedItem),
    ...moments.map(momentToFeedItem),
  ]
    .filter((c) => c.daysUntil >= 0 && c.daysUntil <= days)
    .filter((c) => c.favourites >= minFavourites);

  if (momentKind) {
    items = items.filter(
      (c) => c.feedKind !== "moment" || c.momentKind === momentKind,
    );
  }

  if (q) {
    items = items.filter((c) => {
      const hay = [
        c.nameFull,
        c.franchise,
        c.summary,
        c.show?.titleEnglish,
        c.show?.titleRomaji,
        ...(c.show?.genres ?? []),
        ...(c.show?.demos ?? []),
        c.momentKind,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (demo) {
    items = items.filter((c) =>
      (c.show?.demos ?? []).some((d) => d.toLowerCase() === demo),
    );
  }

  items.sort((a, b) => {
    // Soft birthday priority when mixed "all" + relevance: tiny boost
    if (sort === "relevance" && type === "all" && a.feedKind !== b.feedKind) {
      const boost = (x: UpcomingItem) =>
        x.relevance + (x.feedKind === "birthday" ? 4 : 0);
      return boost(b) - boost(a);
    }
    if (sort === "popularity") return b.favourites - a.favourites;
    if (sort === "relevance") return b.relevance - a.relevance;
    if (sort === "ugc") return b.ugcScore - a.ugcScore;
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return b.favourites - a.favourites;
  });

  return items.slice(0, limit);
}

export async function getBiggestThisWeek(limit = 5) {
  const upcoming = await getUpcomingCharacters({
    days: 7,
    limit: 100,
    sort: "popularity",
    type: "birthday",
  });
  return upcoming.slice(0, limit);
}

export async function getCalendarMonth(year: number, month: number) {
  const [characters, moments] = await Promise.all([
    loadCharacters(),
    loadMoments(),
  ]);
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDay: Record<
    number,
    {
      characters: Array<CharacterRecord & { show: ShowRecord | null }>;
      moments: MomentRecord[];
    }
  > = {};

  for (let d = 1; d <= daysInMonth; d++) {
    byDay[d] = { characters: [], moments: [] };
  }

  for (const c of characters) {
    if (c.birthMonth !== month) continue;
    byDay[c.birthDay]?.characters.push({ ...c, show: c.show });
  }
  for (const m of moments) {
    if (m.month !== month) continue;
    byDay[m.day]?.moments.push(m);
  }

  for (const day of Object.keys(byDay)) {
    byDay[Number(day)].characters.sort((a, b) => b.favourites - a.favourites);
    byDay[Number(day)].moments.sort((a, b) => b.significance - a.significance);
  }

  return { year, month, byDay };
}

export async function getCharacterBySlug(
  slug: string,
): Promise<CharacterWithShow | null> {
  if (hasDatabaseUrl()) {
    return pgGetCharacterBySlug(slug);
  }
  const store = await readStore();
  const character = store.characters.find((c) => c.slug === slug);
  if (!character) return null;
  const show = character.showId
    ? store.shows.find((s) => s.id === character.showId) ?? null
    : null;
  return {
    ...character,
    show,
    hashtags: store.hashtags.filter((h) => h.characterId === character.id),
    tiktokVideos: store.tiktokVideos.filter((v) => v.characterId === character.id),
  };
}

export async function getMomentBySlug(
  slug: string,
): Promise<MomentRecord | null> {
  const store = await readStore();
  return store.moments.find((m) => m.slug === slug) ?? null;
}

export async function addCharacterTikTokVideo(
  slug: string,
  videoUrl: string,
) {
  if (!isValidTikTokUrl(videoUrl)) {
    throw new Error("Invalid TikTok video URL");
  }

  const oembed = await fetchTikTokOEmbed(videoUrl);

  if (hasDatabaseUrl()) {
    const character = await pgGetCharacterBySlug(slug);
    if (!character) throw new Error("Character not found");
    return pgAddTiktokVideo({
      characterId: character.id,
      videoUrl,
      title: oembed.title,
      authorName: oembed.authorName,
      thumbnailUrl: oembed.thumbnailUrl,
      embedHtml: oembed.html,
    });
  }

  const store = await readStore();
  const character = store.characters.find((c) => c.slug === slug);
  if (!character) {
    throw new Error("Character not found");
  }

  const video = addTiktokVideo(store, {
    characterId: character.id,
    videoUrl,
    title: oembed.title,
    authorName: oembed.authorName,
    thumbnailUrl: oembed.thumbnailUrl,
    embedHtml: oembed.html,
  });
  await writeStore(store);
  return video;
}

export async function updateCharacterUgc(slug: string, ugcVolume: number) {
  const store = await readStore();
  const character = store.characters.find((c) => c.slug === slug);
  if (!character) throw new Error("Character not found");
  setCharacterUgc(store, character.id, ugcVolume);
  await writeStore(store);
  if (hasDatabaseUrl()) {
    await syncStoreToPostgres(store);
  }
  return character;
}

export async function updateMomentUgc(slug: string, ugcVolume: number) {
  const store = await readStore();
  const moment = store.moments.find((m) => m.slug === slug);
  if (!moment) throw new Error("Moment not found");
  setMomentUgc(store, moment.id, ugcVolume);
  await writeStore(store);
  if (hasDatabaseUrl()) {
    await syncStoreToPostgres(store);
  }
  return moment;
}
