const ANILIST_URL = "https://graphql.anilist.co";

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
    nodes: AniListMedia[];
  };
};

export type AniListMedia = {
  id: number;
  type: "ANIME" | "MANGA";
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
      media(sort: POPULARITY_DESC, type: ANIME, perPage: 3) {
        nodes {
          id
          type
          title { romaji english native }
          coverImage { large medium }
          genres
          tags { name category }
          popularity
          favourites
          siteUrl
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
      media(sort: POPULARITY_DESC, type: ANIME, perPage: 3) {
        nodes {
          id
          type
          title { romaji english native }
          coverImage { large medium }
          genres
          tags { name category }
          popularity
          favourites
          siteUrl
        }
      }
    }
  }
}
`;

async function anilistFetch<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 0 },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
    await sleep(retryAfter * 1000);
    return anilistFetch(query, variables);
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
}): Promise<AniListCharacter[]> {
  const maxPages = options?.maxPages ?? 20;
  const perPage = options?.perPage ?? 50;
  const delayMs = options?.delayMs ?? 700;
  const results: AniListCharacter[] = [];

  for (let page = 1; page <= maxPages; page++) {
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

export function pickPrimaryMedia(
  media: AniListMedia[],
): AniListMedia | null {
  const anime = media.filter((m) => m.type === "ANIME");
  return anime[0] ?? media[0] ?? null;
}
