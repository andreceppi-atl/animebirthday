export type DemoTag = "Shounen" | "Shoujo" | "Seinen" | "Josei";

export const DEMO_TAGS: DemoTag[] = ["Shounen", "Shoujo", "Seinen", "Josei"];

export type ShowRecord = {
  id: number;
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  genres: string[];
  demos: string[];
  popularity: number;
  favourites: number;
  siteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CharacterRecord = {
  id: number;
  anilistId: number | null;
  slug: string;
  nameFull: string;
  nameFirst: string | null;
  nameLast: string | null;
  nameNative: string | null;
  image: string | null;
  birthMonth: number;
  birthDay: number;
  favourites: number;
  showId: number | null;
  /** Secondary shows (cameos / crossovers) — listed alongside primary */
  alsoShowIds: number[];
  wikiUrl: string | null;
  description: string | null;
  source: "anilist" | "wiki";
  /** ChartEx TikTok sound / create volume when known */
  ugcVolume: number | null;
  ugcUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HashtagRecord = {
  id: number;
  characterId: number;
  tag: string;
  kind: string;
};

export type TiktokVideoRecord = {
  id: number;
  characterId: number;
  videoUrl: string;
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  embedHtml: string | null;
  createdAt: string;
};

export type IngestRunRecord = {
  id: number;
  source: string;
  status: string;
  charactersUpserted: number;
  showsUpserted: number;
  momentsUpserted?: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type MomentKind =
  | "combat"
  | "death"
  | "release"
  | "release_anniversary"
  | "anniversary"
  | "cultural"
  | "kaiju"
  | "other";

export type MomentRecord = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  kind: MomentKind;
  /** Franchise / series label (Naruto, Godzilla, etc.) */
  franchise: string | null;
  image: string | null;
  month: number;
  day: number;
  /** Original year if known (for display); recurrence is month/day */
  year: number | null;
  significance: number;
  wikiUrl: string | null;
  source: "wiki" | "anilist" | "seed";
  tags: string[];
  ugcVolume: number | null;
  ugcUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreData = {
  shows: ShowRecord[];
  characters: CharacterRecord[];
  hashtags: HashtagRecord[];
  tiktokVideos: TiktokVideoRecord[];
  moments: MomentRecord[];
  ingestRuns: IngestRunRecord[];
  nextIds: {
    shows: number;
    characters: number;
    hashtags: number;
    tiktokVideos: number;
    moments: number;
    ingestRuns: number;
  };
};

export type CharacterWithShow = CharacterRecord & {
  show: ShowRecord | null;
  alsoShows: ShowRecord[];
  hashtags: HashtagRecord[];
  tiktokVideos: TiktokVideoRecord[];
};

export type FeedKind = "birthday" | "moment";
