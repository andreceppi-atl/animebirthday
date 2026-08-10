import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db";
import {
  characterHashtags,
  characters,
  ingestRuns,
  shows,
  tiktokVideos,
} from "@/lib/db/schema";
import type {
  CharacterRecord,
  CharacterWithShow,
  HashtagRecord,
  ShowRecord,
  StoreData,
  TiktokVideoRecord,
} from "@/lib/types";
import { generateHashtags } from "@/lib/tiktok/hashtags";

export { hasDatabaseUrl };

function mapShow(row: typeof shows.$inferSelect): ShowRecord {
  return {
    id: row.id,
    anilistId: row.anilistId,
    titleRomaji: row.titleRomaji,
    titleEnglish: row.titleEnglish,
    titleNative: row.titleNative,
    coverImage: row.coverImage,
    genres: row.genres ?? [],
    demos: row.demos ?? [],
    popularity: row.popularity,
    favourites: row.favourites,
    siteUrl: row.siteUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCharacter(row: typeof characters.$inferSelect): CharacterRecord {
  return {
    id: row.id,
    anilistId: row.anilistId,
    slug: row.slug,
    nameFull: row.nameFull,
    nameFirst: row.nameFirst,
    nameLast: row.nameLast,
    nameNative: row.nameNative,
    image: row.image,
    birthMonth: row.birthMonth,
    birthDay: row.birthDay,
    favourites: row.favourites,
    showId: row.showId,
    wikiUrl: row.wikiUrl,
    description: row.description,
    source: (row.source as "anilist" | "wiki") ?? "anilist",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function pgCharacterCount(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(characters);
  return rows[0]?.count ?? 0;
}

export async function pgGetAllCharactersWithRelations(): Promise<
  CharacterWithShow[]
> {
  const db = getDb();
  const [charRows, showRows, tagRows, videoRows] = await Promise.all([
    db.select().from(characters),
    db.select().from(shows),
    db.select().from(characterHashtags),
    db.select().from(tiktokVideos),
  ]);

  const showMap = new Map(showRows.map((s) => [s.id, mapShow(s)]));
  const tagsByChar = new Map<number, HashtagRecord[]>();
  for (const t of tagRows) {
    const list = tagsByChar.get(t.characterId) ?? [];
    list.push({
      id: t.id,
      characterId: t.characterId,
      tag: t.tag,
      kind: t.kind,
    });
    tagsByChar.set(t.characterId, list);
  }
  const videosByChar = new Map<number, TiktokVideoRecord[]>();
  for (const v of videoRows) {
    const list = videosByChar.get(v.characterId) ?? [];
    list.push({
      id: v.id,
      characterId: v.characterId,
      videoUrl: v.videoUrl,
      title: v.title,
      authorName: v.authorName,
      thumbnailUrl: v.thumbnailUrl,
      embedHtml: v.embedHtml,
      createdAt: v.createdAt.toISOString(),
    });
    videosByChar.set(v.characterId, list);
  }

  return charRows.map((c) => {
    const character = mapCharacter(c);
    return {
      ...character,
      show: c.showId ? showMap.get(c.showId) ?? null : null,
      hashtags: tagsByChar.get(c.id) ?? [],
      tiktokVideos: videosByChar.get(c.id) ?? [],
    };
  });
}

export async function pgGetCharacterBySlug(
  slug: string,
): Promise<CharacterWithShow | null> {
  const db = getDb();
  const rows = await db.select().from(characters).where(eq(characters.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const show = row.showId
    ? (
        await db.select().from(shows).where(eq(shows.id, row.showId)).limit(1)
      )[0]
    : null;
  const tags = await db
    .select()
    .from(characterHashtags)
    .where(eq(characterHashtags.characterId, row.id));
  const videos = await db
    .select()
    .from(tiktokVideos)
    .where(eq(tiktokVideos.characterId, row.id));

  return {
    ...mapCharacter(row),
    show: show ? mapShow(show) : null,
    hashtags: tags.map((t) => ({
      id: t.id,
      characterId: t.characterId,
      tag: t.tag,
      kind: t.kind,
    })),
    tiktokVideos: videos.map((v) => ({
      id: v.id,
      characterId: v.characterId,
      videoUrl: v.videoUrl,
      title: v.title,
      authorName: v.authorName,
      thumbnailUrl: v.thumbnailUrl,
      embedHtml: v.embedHtml,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

export async function pgAddTiktokVideo(input: {
  characterId: number;
  videoUrl: string;
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  embedHtml: string | null;
}): Promise<TiktokVideoRecord> {
  const db = getDb();
  const existing = await db
    .select()
    .from(tiktokVideos)
    .where(
      and(
        eq(tiktokVideos.characterId, input.characterId),
        eq(tiktokVideos.videoUrl, input.videoUrl),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(tiktokVideos)
      .set({
        title: input.title,
        authorName: input.authorName,
        thumbnailUrl: input.thumbnailUrl,
        embedHtml: input.embedHtml,
      })
      .where(eq(tiktokVideos.id, existing[0].id))
      .returning();
    return {
      id: updated.id,
      characterId: updated.characterId,
      videoUrl: updated.videoUrl,
      title: updated.title,
      authorName: updated.authorName,
      thumbnailUrl: updated.thumbnailUrl,
      embedHtml: updated.embedHtml,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  const [inserted] = await db
    .insert(tiktokVideos)
    .values({
      characterId: input.characterId,
      videoUrl: input.videoUrl,
      title: input.title,
      authorName: input.authorName,
      thumbnailUrl: input.thumbnailUrl,
      embedHtml: input.embedHtml,
    })
    .returning();

  return {
    id: inserted.id,
    characterId: inserted.characterId,
    videoUrl: inserted.videoUrl,
    title: inserted.title,
    authorName: inserted.authorName,
    thumbnailUrl: inserted.thumbnailUrl,
    embedHtml: inserted.embedHtml,
    createdAt: inserted.createdAt.toISOString(),
  };
}

/** Push local JSON store into Neon (full replace of catalog tables). */
export async function syncStoreToPostgres(store: StoreData): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Clear dependent tables first
  await db.delete(tiktokVideos);
  await db.delete(characterHashtags);
  await db.delete(characters);
  await db.delete(shows);

  const showIdMap = new Map<number, number>();

  for (const s of store.shows) {
    const [row] = await db
      .insert(shows)
      .values({
        anilistId: s.anilistId,
        titleRomaji: s.titleRomaji,
        titleEnglish: s.titleEnglish,
        titleNative: s.titleNative,
        coverImage: s.coverImage,
        genres: s.genres,
        demos: s.demos,
        popularity: s.popularity,
        favourites: s.favourites,
        siteUrl: s.siteUrl,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    showIdMap.set(s.id, row.id);
  }

  const characterIdMap = new Map<number, number>();

  for (const c of store.characters) {
    const [row] = await db
      .insert(characters)
      .values({
        anilistId: c.anilistId,
        slug: c.slug,
        nameFull: c.nameFull,
        nameFirst: c.nameFirst,
        nameLast: c.nameLast,
        nameNative: c.nameNative,
        image: c.image,
        birthMonth: c.birthMonth,
        birthDay: c.birthDay,
        favourites: c.favourites,
        showId: c.showId ? showIdMap.get(c.showId) ?? null : null,
        wikiUrl: c.wikiUrl,
        description: c.description,
        source: c.source,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    characterIdMap.set(c.id, row.id);
  }

  for (const h of store.hashtags) {
    const characterId = characterIdMap.get(h.characterId);
    if (!characterId) continue;
    await db.insert(characterHashtags).values({
      characterId,
      tag: h.tag,
      kind: h.kind,
    });
  }

  for (const v of store.tiktokVideos) {
    const characterId = characterIdMap.get(v.characterId);
    if (!characterId) continue;
    await db.insert(tiktokVideos).values({
      characterId,
      videoUrl: v.videoUrl,
      title: v.title,
      authorName: v.authorName,
      thumbnailUrl: v.thumbnailUrl,
      embedHtml: v.embedHtml,
      createdAt: new Date(v.createdAt),
    });
  }

  for (const run of store.ingestRuns.slice(-20)) {
    await db.insert(ingestRuns).values({
      source: run.source,
      status: run.status,
      charactersUpserted: run.charactersUpserted,
      showsUpserted: run.showsUpserted,
      error: run.error,
      startedAt: new Date(run.startedAt),
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
    });
  }
}

export async function pgEnsureHashtagsForCharacter(characterId: number) {
  const db = getDb();
  const existing = await db
    .select()
    .from(characterHashtags)
    .where(eq(characterHashtags.characterId, characterId))
    .limit(1);
  if (existing.length) return;

  const [c] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);
  if (!c) return;

  let showTitle: string | null = null;
  if (c.showId) {
    const [s] = await db.select().from(shows).where(eq(shows.id, c.showId)).limit(1);
    showTitle = s?.titleEnglish || s?.titleRomaji || null;
  }

  const tags = generateHashtags({
    nameFull: c.nameFull,
    nameFirst: c.nameFirst,
    showTitle,
  });

  if (tags.length) {
    await db.insert(characterHashtags).values(
      tags.map((t) => ({
        characterId,
        tag: t.tag,
        kind: t.kind,
      })),
    );
  }
}

export async function pgListCharactersForMonth(month: number) {
  const db = getDb();
  return db
    .select()
    .from(characters)
    .where(eq(characters.birthMonth, month))
    .orderBy(asc(characters.birthDay));
}
