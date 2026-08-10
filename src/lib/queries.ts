import {
  addTiktokVideo,
  readStore,
  writeStore,
} from "@/lib/db/store";
import {
  hasDatabaseUrl,
  pgAddTiktokVideo,
  pgCharacterCount,
  pgGetAllCharactersWithRelations,
  pgGetCharacterBySlug,
} from "@/lib/db/postgres";
import type {
  CharacterWithShow,
  CharacterRecord,
  ShowRecord,
} from "@/lib/types";
import { daysUntilBirthday, nextBirthdayDate } from "@/lib/utils";
import { fetchTikTokOEmbed, isValidTikTokUrl } from "@/lib/tiktok/oembed";

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

export async function getUpcomingCharacters(options?: {
  days?: number;
  limit?: number;
}): Promise<
  Array<
    CharacterWithShow & {
      daysUntil: number;
      nextDate: string;
    }
  >
> {
  const days = options?.days ?? 14;
  const limit = options?.limit ?? 50;
  const all = await loadCharacters();

  return all
    .map((c) => {
      const daysUntil = daysUntilBirthday(c.birthMonth, c.birthDay);
      const nextDate = nextBirthdayDate(c.birthMonth, c.birthDay);
      return {
        ...c,
        daysUntil,
        nextDate: nextDate.toISOString(),
      };
    })
    .filter((c) => c.daysUntil >= 0 && c.daysUntil <= days)
    .sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return b.favourites - a.favourites;
    })
    .slice(0, limit);
}

export async function getBiggestThisWeek(limit = 5) {
  const upcoming = await getUpcomingCharacters({ days: 7, limit: 100 });
  return [...upcoming].sort((a, b) => b.favourites - a.favourites).slice(0, limit);
}

export async function getCalendarMonth(year: number, month: number) {
  const all = await loadCharacters();
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDay: Record<
    number,
    Array<CharacterRecord & { show: ShowRecord | null }>
  > = {};

  for (let d = 1; d <= daysInMonth; d++) {
    byDay[d] = [];
  }

  for (const c of all) {
    if (c.birthMonth !== month) continue;
    byDay[c.birthDay]?.push({ ...c, show: c.show });
  }

  for (const day of Object.keys(byDay)) {
    byDay[Number(day)].sort((a, b) => b.favourites - a.favourites);
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
