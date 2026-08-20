const ANILIST_URL = "https://graphql.anilist.co";

export type CharacterRole = "MAIN" | "SUPPORTING" | "BACKGROUND" | string;

export type AniListCharacterPage = {
  Page: {
    pageInfo: {
      total: number;
      currentPage: number;
      lastPage: number;
      hasNextPage: boolean;
    };
    characters: AniListCharacter[];
  };
};

export type AniListMedia = {
  id: number;
  type: "ANIME" | "MANGA";
  format?: string | null;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: { large: string | null; medium: string | null };
  genres: string[];
  tags: { name: string; category: string | null }[];
  popularity: number;
  favourites: number;
  siteUrl: string;
};

export type AniListMediaWithRole = AniListMedia & {
  characterRole?: CharacterRole;
};

export type AniListCharacter = {
  id: number;
  name: {
    full: string;
    first: string | null;
    last: string | null;
    native: string | null;
  };
  image: { large: string | null; medium: string | null };
  description: string | null;
  dateOfBirth: { month: number | null; day: number | null; year: number | null };
  favourites: number;
  siteUrl: string;
  media: {
    nodes?: AniListMedia[];
    edges?: Array<{
      characterRole: CharacterRole;
      node: AniListMedia;
    }>;
  };
};

const MEDIA_FIELDS = `
  id
  type
  format
  title { romaji english native }
  coverImage { large medium }
  genres
  tags { name category }
  popularity
  favourites
  siteUrl
`;

const CHARACTER_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
    }
    characters(sort: FAVOURITES_DESC) {
      id
      name { full first last native }
      image { large medium }
      description
      dateOfBirth { month day year }
      favourites
      siteUrl
      media(sort: POPULARITY_DESC, type: ANIME, perPage: 8) {
        edges {
          characterRole
          node { ${MEDIA_FIELDS} }
        }
      }
    }
  }
}
`;

const BIRTHDAY_TODAY_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage }
    characters(isBirthday: true, sort: FAVOURITES_DESC) {
      id
      name { full first last native }
      image { large medium }
      description
      dateOfBirth { month day year }
      favourites
      siteUrl
      media(sort: POPULARITY_DESC, type: ANIME, perPage: 8) {
        edges {
          characterRole
          node { ${MEDIA_FIELDS} }
        }
      }
    }
  }
}
`;

const CHARACTER_BY_ID_QUERY = `
query ($id: Int) {
  Character(id: $id) {
    id
    name { full first last native }
    image { large medium }
    description
    dateOfBirth { month day year }
    favourites
    siteUrl
    media(sort: POPULARITY_DESC, type: ANIME, perPage: 12) {
      edges {
        characterRole
        node { ${MEDIA_FIELDS} }
      }
    }
  }
}
`;

const CHARACTER_SEARCH_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 8) {
    characters(search: $search, sort: FAVOURITES_DESC) {
      id
      name { full first last native }
      image { large medium }
      description
      dateOfBirth { month day year }
      favourites
      siteUrl
      media(sort: POPULARITY_DESC, type: ANIME, perPage: 12) {
        edges {
          characterRole
          node { ${MEDIA_FIELDS} }
        }
      }
    }
  }
}
`;

async function anilistFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  rateLimitRetries = 0,
): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 429) {
    if (rateLimitRetries >= 5) {
      throw new Error("AniList rate-limited too many times");
    }
    const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
    await sleep(Math.min(retryAfter, 30) * 1000);
    return anilistFetch(query, variables, rateLimitRetries + 1);
  }

  if (!res.ok) {
    throw new Error(`AniList error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("AniList returned empty data");
  }
  return json.data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTopCharactersWithBirthdays(options?: {
  maxPages?: number;
  perPage?: number;
  delayMs?: number;
  /** 1-based start page (for rotating deep crawls). Default 1. */
  startPage?: number;
}): Promise<AniListCharacter[]> {
  const maxPages = options?.maxPages ?? 20;
  const perPage = options?.perPage ?? 50;
  const delayMs = options?.delayMs ?? 700;
  const startPage = Math.max(1, options?.startPage ?? 1);
  const results: AniListCharacter[] = [];

  for (let i = 0; i < maxPages; i++) {
    const page = startPage + i;
    const data = await anilistFetch<AniListCharacterPage>(CHARACTER_QUERY, {
      page,
      perPage,
    });

    for (const c of data.Page.characters) {
      if (c.dateOfBirth?.month && c.dateOfBirth?.day) {
        results.push(c);
      }
    }

    if (!data.Page.pageInfo.hasNextPage) break;
    await sleep(delayMs);
  }

  return results;
}

export type MediaCharacterEdge = {
  role: CharacterRole;
  character: AniListCharacter;
};

const MEDIA_CHARACTERS_QUERY = `
query ($id: Int, $page: Int) {
  Media(id: $id, type: ANIME) {
    id
    characters(sort: [ROLE, FAVOURITES_DESC], page: $page, perPage: 25) {
      pageInfo { hasNextPage }
      edges {
        role
        node {
          id
          name { full first last native }
          image { large medium }
          description
          dateOfBirth { month day year }
          favourites
          siteUrl
          media(sort: POPULARITY_DESC, type: ANIME, perPage: 6) {
            edges {
              characterRole
              node { ${MEDIA_FIELDS} }
            }
          }
        }
      }
    }
  }
}
`;

/** MAIN/SUPPORTING (and high-fav) cast for one anime — used to catch franchise DOB gaps. */
export async function fetchMediaCharacterEdges(
  mediaId: number,
  options?: { pages?: number; delayMs?: number },
): Promise<MediaCharacterEdge[]> {
  const pages = options?.pages ?? 1;
  const delayMs = options?.delayMs ?? 500;
  const out: MediaCharacterEdge[] = [];

  for (let page = 1; page <= pages; page++) {
    const data = await anilistFetch<{
      Media: {
        characters: {
          pageInfo: { hasNextPage: boolean };
          edges: Array<{ role: CharacterRole; node: AniListCharacter }>;
        };
      } | null;
    }>(MEDIA_CHARACTERS_QUERY, { id: mediaId, page });

    const edges = data.Media?.characters?.edges ?? [];
    for (const e of edges) {
      if (!e?.node) continue;
      out.push({ role: e.role, character: e.node });
    }
    if (!data.Media?.characters?.pageInfo?.hasNextPage) break;
    await sleep(delayMs);
  }

  return out;
}

export async function fetchTodaysBirthdayCharacters(): Promise<AniListCharacter[]> {
  const results: AniListCharacter[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await anilistFetch<AniListCharacterPage>(BIRTHDAY_TODAY_QUERY, {
      page,
      perPage: 50,
    });
    results.push(...data.Page.characters);
    if (!data.Page.pageInfo.hasNextPage) break;
    await sleep(500);
  }
  return results;
}

export async function fetchCharacterById(
  anilistId: number,
): Promise<AniListCharacter | null> {
  const data = await anilistFetch<{ Character: AniListCharacter | null }>(
    CHARACTER_BY_ID_QUERY,
    { id: anilistId },
  );
  return data.Character;
}

export async function searchCharactersByName(
  search: string,
): Promise<AniListCharacter[]> {
  const data = await anilistFetch<{
    Page: { characters: AniListCharacter[] };
  }>(CHARACTER_SEARCH_QUERY, { search });
  return data.Page.characters ?? [];
}

/** Flatten media edges (preferred) or legacy nodes into role-aware rows. */
export function mediaWithRoles(
  character: AniListCharacter,
): AniListMediaWithRole[] {
  if (character.media?.edges?.length) {
    return character.media.edges.map((e) => ({
      ...e.node,
      characterRole: e.characterRole,
    }));
  }
  return (character.media?.nodes ?? []).map((n) => ({ ...n }));
}

function roleScore(role?: CharacterRole): number {
  // BACKGROUND cameos must lose even against less-popular MAIN/SUPPORTING series
  // (Saiki BACKGROUND in Assassination Classroom vs MAIN in Saiki K.).
  // Do NOT let MAIN crush SUPPORTING on ensemble casts (Levi is SUPPORTING in AoT S1
  // but MAIN in S3 — flagship popularity should win).
  if (role === "BACKGROUND") return 0;
  if (role === "MAIN") return 530;
  if (role === "SUPPORTING") return 500;
  return 480;
}

function formatScore(format?: string | null): number {
  const f = (format ?? "TV").toUpperCase();
  if (f === "TV" || f === "TV_SHORT" || f === "MOVIE") return 40;
  if (f === "ONA") return 0;
  if (f === "OVA" || f === "SPECIAL" || f === "MUSIC") return -80;
  return 0;
}

function sequelPenalty(media: AniListMedia): number {
  const title = `${media.title.romaji} ${media.title.english ?? ""}`;
  if (
    /\b(season|part|final season|2nd|3rd|4th|cour)\b/i.test(title) ||
    /\s+\d+(st|nd|rd|th)\s+season/i.test(title)
  ) {
    return -90;
  }
  return 0;
}

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Overlap between character name tokens and show title (catches Saiki → Saiki K.). */
export function nameTitleOverlapScore(
  characterName: string,
  media: AniListMedia,
): number {
  const nameTokens = new Set(normalizeTokens(characterName));
  if (!nameTokens.size) return 0;
  const title = [
    media.title.romaji,
    media.title.english ?? "",
    media.title.native ?? "",
  ].join(" ");
  const titleLower = title.toLowerCase();
  let hits = 0;
  for (const t of nameTokens) {
    if (titleLower.includes(t)) hits++;
  }
  return hits * 55;
}

/**
 * Pick the show a character is actually from.
 * Prefer non-BACKGROUND appearances, flagship popularity, and name overlap —
 * not raw popularity alone (which promotes cameos in mega-hits).
 */
export function pickPrimaryMedia(
  media: AniListMediaWithRole[] | AniListMedia[],
  characterName?: string,
): AniListMediaWithRole | null {
  const anime = (media as AniListMediaWithRole[]).filter(
    (m) => m.type === "ANIME",
  );
  if (!anime.length) {
    return (media as AniListMediaWithRole[])[0] ?? null;
  }

  const scored = anime.map((m) => {
    const role = roleScore(m.characterRole);
    const nameBoost = characterName
      ? nameTitleOverlapScore(characterName, m)
      : 0;
    const pop = Math.log10(Math.max(m.popularity ?? 1, 1)) * 100;
    const format = formatScore(m.format);
    const sequel = sequelPenalty(m);
    return {
      media: m,
      score: role + nameBoost + pop + format + sequel,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.media ?? null;
}

function franchiseTokens(media: AniListMedia): Set<string> {
  const stop = new Set([
    "season",
    "part",
    "final",
    "movie",
    "the",
    "and",
    "ova",
    "ona",
    "tv",
    "series",
    "black",
    "white",
  ]);
  return new Set(
    normalizeTokens(
      `${media.title.romaji} ${media.title.english ?? ""} ${media.title.native ?? ""}`,
    ).filter((t) => !stop.has(t) && !/^\d+$/.test(t)),
  );
}

function titleAlnumForms(media: AniListMedia): string[] {
  return [media.title.romaji, media.title.english ?? "", media.title.native ?? ""]
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((t) => t.length >= 3);
}

/** Longest common substring length — catches Bake/Nise/Neko*monogatari compounds. */
function longestCommonSubstringLen(a: string, b: string): number {
  if (!a || !b) return 0;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  let best = 0;
  for (let i = 0; i < short.length; i++) {
    for (let j = i + best + 1; j <= short.length; j++) {
      const sub = short.slice(i, j);
      if (long.includes(sub)) best = sub.length;
      else break;
    }
  }
  return best;
}

function sharesFranchise(a: AniListMedia, b: AniListMedia): boolean {
  const ta = franchiseTokens(a);
  const tb = franchiseTokens(b);
  for (const t of ta) {
    if (tb.has(t)) return true;
  }
  // Compare each title form separately so word joins can't invent false stems
  // (e.g. subarashii+sekai → "isekai" inside KONOSUBA vs Isekai Quartet).
  const formsA = titleAlnumForms(a);
  const formsB = titleAlnumForms(b);
  for (const fa of formsA) {
    for (const fb of formsB) {
      if (longestCommonSubstringLen(fa, fb) >= 8) return true;
    }
  }
  return false;
}

/**
 * Notable crossover / cameo appearances distinct from the primary series.
 * e.g. Kusuo Saiki MAIN in Saiki K. + BACKGROUND in Assassination Classroom.
 */
export function pickCrossoverMedia(
  media: AniListMediaWithRole[] | AniListMedia[],
  primary: AniListMediaWithRole | null,
  options?: { limit?: number; minPopularity?: number },
): AniListMediaWithRole[] {
  if (!primary) return [];
  const limit = options?.limit ?? 3;
  const minPopularity = options?.minPopularity ?? 40_000;
  const anime = (media as AniListMediaWithRole[]).filter(
    (m) => m.type === "ANIME" && m.id !== primary.id,
  );

  const crossovers = anime.filter((m) => {
    if (sharesFranchise(m, primary)) return false;
    // Cameo in another franchise, or any non-primary appearance tagged BACKGROUND
    if (m.characterRole === "BACKGROUND") return true;
    // Rare: MAIN/SUPPORTING in a totally different franchise (true crossover)
    return (m.popularity ?? 0) >= minPopularity * 2;
  });

  return crossovers
    .filter((m) => (m.popularity ?? 0) >= minPopularity)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, limit);
}
