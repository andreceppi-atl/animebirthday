import {
  addTiktokVideo,
  loadWorkingStore,
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
  pgGetAllMoments,
  pgGetCharacterBySlug,
  pgGetMomentBySlug,
  pgUpdateCharacterUgc,
  pgUpdateMomentUgc,
} from "@/lib/db/postgres";
import { daysUntilBirthday, nextBirthdayDate, normalizeMomentKind } from "@/lib/utils";
import type {
  CharacterWithShow,
  CharacterRecord,
  FeedKind,
  MomentKind,
  MomentRecord,
  ShowRecord,
} from "@/lib/types";
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
  alsoShows?: Array<{
    titleEnglish: string | null;
    titleRomaji: string;
  }>;
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
    alsoShowIds: c.alsoShowIds ?? [],
    show: c.showId ? showMap.get(c.showId) ?? null : null,
    alsoShows: (c.alsoShowIds ?? [])
      .map((id) => showMap.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    hashtags: store.hashtags.filter((h) => h.characterId === c.id),
    tiktokVideos: store.tiktokVideos.filter((v) => v.characterId === c.id),
  }));
}

async function loadMoments(): Promise<MomentRecord[]> {
  if (hasDatabaseUrl()) {
    return pgGetAllMoments();
  }
  const store = await readStore();
  return (store.moments ?? []).map((m) => ({
    ...m,
    kind: normalizeMomentKind(m.kind),
  }));
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
    alsoShows: (c.alsoShows ?? []).map((s) => ({
      titleEnglish: s.titleEnglish,
      titleRomaji: s.titleRomaji,
    })),
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
    momentKind: normalizeMomentKind(m.kind),
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
    alsoShows: [],
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

  // Drop empty wiki stubs when a richer AniList twin exists (same name + birthday)
  const anilistKeys = new Set(
    characters
      .filter((c) => c.anilistId != null)
      .map((c) => `${c.nameFull.toLowerCase()}|${c.birthMonth}|${c.birthDay}`),
  );
  items = items.filter((item) => {
    if (item.feedKind !== "birthday") return true;
    if (item.favourites > 0 || item.image) return true;
    const key = `${item.nameFull.toLowerCase()}|${item.birthMonth}|${item.birthDay}`;
    return !anilistKeys.has(key);
  });

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
    // Popularity descending (favourites), then sooner dates
    if (sort === "popularity") {
      if (b.favourites !== a.favourites) return b.favourites - a.favourites;
      return a.daysUntil - b.daysUntil;
    }
    if (sort === "relevance") return b.relevance - a.relevance;
    if (sort === "ugc") {
      if (b.ugcScore !== a.ugcScore) return b.ugcScore - a.ugcScore;
      return a.daysUntil - b.daysUntil;
    }
    // Date · Popularity: chronological upcoming, favourites descending within day
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

export type MonthPriority = {
  year: number;
  month: number;
  monthLabel: string;
  /** Hottest remaining item this month (birthday or moment) — post this first */
  priority: UpcomingItem | null;
  topBirthday: UpcomingItem | null;
  topMoment: UpcomingItem | null;
  contenders: UpcomingItem[];
};

/**
 * Most popular birthday + moment still ahead this calendar month,
 * ranked so creators know what needs priority ASAP.
 */
export async function getTopPriorityThisMonth(
  from: Date = new Date(),
): Promise<MonthPriority> {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;
  const monthLabel = from.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const end = new Date(year, month, 0);
  end.setHours(0, 0, 0, 0);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const windowDays = Math.max(daysLeft, 0);
  const [birthdays, moments] = await Promise.all([
    windowDays === 0
      ? Promise.resolve([] as UpcomingItem[])
      : getUpcomingCharacters({
          days: windowDays,
          limit: 200,
          sort: "popularity",
          type: "birthday",
        }),
    windowDays === 0
      ? Promise.resolve([] as UpcomingItem[])
      : getUpcomingCharacters({
          days: windowDays,
          limit: 200,
          sort: "popularity",
          type: "moment",
        }),
  ]);

  const inThisMonth = (item: UpcomingItem) => item.birthMonth === month;
  const monthBirthdays = birthdays.filter(inThisMonth);
  const monthMoments = moments.filter(inThisMonth);

  const topBirthday = monthBirthdays[0] ?? null;
  const topMoment = monthMoments[0] ?? null;

  const asapScore = (item: UpcomingItem) => {
    const urgency =
      item.daysUntil === 0
        ? 3
        : item.daysUntil <= 3
          ? 2.25
          : item.daysUntil <= 7
            ? 1.6
            : 1;
    // Favourites × urgency; UGC only as a light tie-break (log scale)
    return (
      item.favourites * urgency +
      Math.log10(Math.max(item.ugcScore, 1)) * 40
    );
  };

  const pooled = [...monthBirthdays, ...monthMoments].sort((a, b) => {
    const diff = asapScore(b) - asapScore(a);
    if (diff !== 0) return diff;
    return a.daysUntil - b.daysUntil;
  });

  const contenders: UpcomingItem[] = [];
  const pushUnique = (item: UpcomingItem | null) => {
    if (!item) return;
    if (
      contenders.some(
        (c) => c.id === item.id && c.feedKind === item.feedKind,
      )
    ) {
      return;
    }
    contenders.push(item);
  };
  // Always surface the month's top birthday + top moment, then fill by ASAP score
  pushUnique(pooled[0] ?? null);
  pushUnique(topBirthday);
  pushUnique(topMoment);
  for (const item of pooled) {
    if (contenders.length >= 3) break;
    pushUnique(item);
  }

  return {
    year,
    month,
    monthLabel,
    priority: pooled[0] ?? null,
    topBirthday,
    topMoment,
    contenders: contenders.slice(0, 3),
  };
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
    alsoShowIds: character.alsoShowIds ?? [],
    show,
    alsoShows: (character.alsoShowIds ?? [])
      .map((id) => store.shows.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    hashtags: store.hashtags.filter((h) => h.characterId === character.id),
    tiktokVideos: store.tiktokVideos.filter((v) => v.characterId === character.id),
  };
}

export async function getMomentBySlug(
  slug: string,
): Promise<MomentRecord | null> {
  if (hasDatabaseUrl()) {
    return pgGetMomentBySlug(slug);
  }
  const store = await readStore();
  const m = store.moments.find((x) => x.slug === slug);
  if (!m) return null;
  return { ...m, kind: normalizeMomentKind(m.kind) };
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
  if (hasDatabaseUrl()) {
    const character = await pgUpdateCharacterUgc(slug, ugcVolume);
    // Keep JSON mirror in sync when writable (local / durable FS)
    try {
      const store = await loadWorkingStore();
      setCharacterUgc(store, character.id, ugcVolume);
      await writeStore(store);
    } catch {
      /* ignore */
    }
    return character;
  }

  const store = await readStore();
  const character = store.characters.find((c) => c.slug === slug);
  if (!character) throw new Error("Character not found");
  setCharacterUgc(store, character.id, ugcVolume);
  await writeStore(store);
  return character;
}

export async function updateMomentUgc(slug: string, ugcVolume: number) {
  if (hasDatabaseUrl()) {
    const moment = await pgUpdateMomentUgc(slug, ugcVolume);
    try {
      const store = await loadWorkingStore();
      setMomentUgc(store, moment.id, ugcVolume);
      await writeStore(store);
    } catch {
      /* ignore */
    }
    return moment;
  }

  const store = await readStore();
  const moment = store.moments.find((m) => m.slug === slug);
  if (!moment) throw new Error("Moment not found");
  setMomentUgc(store, moment.id, ugcVolume);
  await writeStore(store);
  return moment;
}
