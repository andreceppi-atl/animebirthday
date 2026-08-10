import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const shows = pgTable(
  "shows",
  {
    id: serial("id").primaryKey(),
    anilistId: integer("anilist_id"),
    titleRomaji: text("title_romaji").notNull(),
    titleEnglish: text("title_english"),
    titleNative: text("title_native"),
    coverImage: text("cover_image"),
    genres: jsonb("genres").$type<string[]>().notNull().default([]),
    demos: jsonb("demos").$type<string[]>().notNull().default([]),
    popularity: integer("popularity").notNull().default(0),
    favourites: integer("favourites").notNull().default(0),
    siteUrl: text("site_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("shows_anilist_id_idx").on(table.anilistId)],
);

export const characters = pgTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    anilistId: integer("anilist_id"),
    slug: varchar("slug", { length: 255 }).notNull(),
    nameFull: text("name_full").notNull(),
    nameFirst: text("name_first"),
    nameLast: text("name_last"),
    nameNative: text("name_native"),
    image: text("image"),
    birthMonth: integer("birth_month").notNull(),
    birthDay: integer("birth_day").notNull(),
    favourites: integer("favourites").notNull().default(0),
    showId: integer("show_id").references(() => shows.id),
    wikiUrl: text("wiki_url"),
    description: text("description"),
    source: varchar("source", { length: 32 }).notNull().default("anilist"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("characters_slug_idx").on(table.slug),
    uniqueIndex("characters_anilist_id_idx").on(table.anilistId),
  ],
);

export const characterHashtags = pgTable("character_hashtags", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  tag: varchar("tag", { length: 128 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull().default("general"),
});

export const tiktokVideos = pgTable("tiktok_videos", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  videoUrl: text("video_url").notNull(),
  title: text("title"),
  authorName: text("author_name"),
  thumbnailUrl: text("thumbnail_url"),
  embedHtml: text("embed_html"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  charactersUpserted: integer("characters_upserted").notNull().default(0),
  showsUpserted: integer("shows_upserted").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export type Show = typeof shows.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type CharacterHashtag = typeof characterHashtags.$inferSelect;
export type TiktokVideo = typeof tiktokVideos.$inferSelect;
export type IngestRun = typeof ingestRuns.$inferSelect;
