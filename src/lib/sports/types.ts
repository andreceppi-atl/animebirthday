export const SPORTS = [
  "mlb",
  "nba",
  "nfl",
  "nhl",
  "soccer",
  "tennis",
  "combat_sports",
  "olympics",
  "other",
] as const;

export type Sport = (typeof SPORTS)[number];

export type SportsEventSeed = {
  id: string;
  title: string;
  sport: Sport;
  month: number;
  day: number;
  /** Null for recurring / year-agnostic anchors */
  year: number | null;
  recurring: boolean;
  /** 0–100 social / cultural heat */
  significance: number;
  summary: string;
  tags: string[];
  league?: string | null;
  team?: string | null;
  /** Franchises, themes, or genres that historically cross over with this sport */
  animeProximityHints?: string[];
};

export type UpcomingSportsEvent = SportsEventSeed & {
  daysUntil: number;
  nextDate: string;
  dateLabel: string;
};

export type ProximityMatch = {
  hint: string;
  field: "name" | "franchise" | "show" | "genre" | "tag";
};

export type SportsAnimeOverlap = {
  sportsEvent: UpcomingSportsEvent;
  animeItem: {
    feedKind: "birthday" | "moment";
    id: number;
    slug: string;
    nameFull: string;
    image: string | null;
    birthMonth: number;
    birthDay: number;
    favourites: number;
    daysUntil: number;
    nextDate: string;
    relevance: number;
    momentKind?: string;
    franchise?: string | null;
    show: {
      titleEnglish: string | null;
      titleRomaji: string;
      demos: string[];
      genres: string[];
    } | null;
  };
  /** Combined overlap score (higher = better creator timing) */
  overlapScore: number;
  proximityMatches: ProximityMatch[];
  hasProximity: boolean;
};
