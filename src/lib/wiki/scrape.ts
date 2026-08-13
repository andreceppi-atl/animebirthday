import * as cheerio from "cheerio";
import { promises as fs } from "fs";
import path from "path";
import { slugify } from "@/lib/utils";

export type WikiBirthdayEntry = {
  name: string;
  series: string | null;
  birthMonth: number;
  birthDay: number;
  wikiUrl: string | null;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const UA =
  "AnimeBirthdayCalendar/1.0 (+https://github.com/animebirthday; creator tool)";

const WIKI_SEED_PATH = path.join(process.cwd(), "data", "wiki-seed.json");

type JikanCharacter = {
  mal_id: number;
  name: string;
  url: string;
  birthday?: string | null;
};

/**
 * Jikan (MAL API mirror) — top characters that include birthdays.
 */
export async function scrapeJikanBirthdays(options?: {
  maxPages?: number;
  delayMs?: number;
}): Promise<WikiBirthdayEntry[]> {
  const maxPages = options?.maxPages ?? 3;
  const delayMs = options?.delayMs ?? 500;
  const entries: WikiBirthdayEntry[] = [];
  let rateLimitRetries = 0;
  const maxRateLimitRetries = 3;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.jikan.moe/v4/top/characters?page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      console.warn(`Wiki: Jikan page ${page} timed out — stopping Jikan`);
      break;
    }

    if (res.status === 429) {
      rateLimitRetries++;
      if (rateLimitRetries > maxRateLimitRetries) {
        console.warn("Wiki: Jikan rate-limited too often — stopping");
        break;
      }
      await sleep(delayMs * 3);
      page--;
      continue;
    }

    if (!res.ok) {
      if (entries.length) return dedupeEntries(entries);
      throw new Error(`Jikan top characters failed (${res.status}) page ${page}`);
    }

    rateLimitRetries = 0;

    const json = (await res.json()) as {
      data: Array<{ mal_id: number; name: string; url: string }>;
      pagination: { has_next_page: boolean };
    };

    for (const c of json.data) {
      try {
        const detailRes = await fetch(
          `https://api.jikan.moe/v4/characters/${c.mal_id}`,
          {
            headers: { "User-Agent": UA, Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          },
        );

        if (detailRes.status === 429) {
          await sleep(delayMs * 3);
          continue;
        }
        if (!detailRes.ok) continue;

        const detail = (await detailRes.json()) as { data: JikanCharacter };
        const parsed = parseIsoBirthday(detail.data.birthday);
        if (!parsed) continue;

        entries.push({
          name: detail.data.name,
          series: null,
          birthMonth: parsed.month,
          birthDay: parsed.day,
          wikiUrl: detail.data.url,
        });
      } catch {
        // skip timeouts / individual failures
      }
      await sleep(delayMs);
    }

    if (!json.pagination.has_next_page) break;
    await sleep(delayMs);
  }

  return dedupeEntries(entries);
}

/**
 * Scrape an HTML birthday table (Fandom / wiki style).
 */
export async function scrapeFandomBirthdayTable(
  pageUrl: string,
): Promise<WikiBirthdayEntry[]> {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Wiki HTML fetch failed (${res.status})`);
  }

  const html = await res.text();
  if (html.includes("Just a moment...") || html.includes("Checking browser")) {
    throw new Error("Wiki challenge page — HTML scrape blocked");
  }

  const $ = cheerio.load(html);
  const entries: WikiBirthdayEntry[] = [];

  $("table.wikitable tr, table.article-table tr, table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const dateText = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const nameCell = $(cells[1]);
    const name =
      nameCell.find("a").first().text().trim() || nameCell.text().trim();
    const series =
      cells.length > 2
        ? $(cells[2]).find("a").first().text().trim() ||
          $(cells[2]).text().trim() ||
          null
        : null;
    const href = nameCell.find("a").first().attr("href");
    const parsed = parseDateCell(dateText);
    if (!parsed || !name || name.length < 2) return;

    entries.push({
      name,
      series: series || null,
      birthMonth: parsed.month,
      birthDay: parsed.day,
      wikiUrl: href
        ? href.startsWith("http")
          ? href
          : new URL(href, pageUrl).toString()
        : null,
    });
  });

  return dedupeEntries(entries);
}

/**
 * AniList deep-page crawl as structured birthday list (coverage fill when MAL is down).
 * Returns entries shaped like wiki rows; ingest still fuzzy-matches into the store.
 */
export async function scrapeAniListBirthdayList(options?: {
  startPage?: number;
  maxPages?: number;
}): Promise<WikiBirthdayEntry[]> {
  const startPage = options?.startPage ?? 16;
  const maxPages = options?.maxPages ?? 8;
  const entries: WikiBirthdayEntry[] = [];
  let rateLimitHits = 0;

  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        characters(sort: FAVOURITES_DESC) {
          name { full }
          siteUrl
          dateOfBirth { month day }
          media(sort: POPULARITY_DESC, type: ANIME, perPage: 1) {
            nodes { title { english romaji } }
          }
        }
      }
    }
  `;

  for (let page = startPage; page < startPage + maxPages; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { page } }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 429) {
      rateLimitHits++;
      if (rateLimitHits > 3) {
        console.warn("Wiki: AniList deep list rate-limited — stopping");
        break;
      }
      await sleep(2000);
      page--;
      continue;
    }
    rateLimitHits = 0;
    if (!res.ok) break;

    const json = (await res.json()) as {
      data?: {
        Page: {
          pageInfo: { hasNextPage: boolean };
          characters: Array<{
            name: { full: string };
            siteUrl: string;
            dateOfBirth: { month: number | null; day: number | null };
            media: { nodes: Array<{ title: { english: string | null; romaji: string } }> };
          }>;
        };
      };
    };

    const pageData = json.data?.Page;
    if (!pageData) break;

    for (const c of pageData.characters) {
      if (!c.dateOfBirth?.month || !c.dateOfBirth?.day) continue;
      const media = c.media.nodes[0];
      entries.push({
        name: c.name.full,
        series: media?.title.english || media?.title.romaji || null,
        birthMonth: c.dateOfBirth.month,
        birthDay: c.dateOfBirth.day,
        wikiUrl: c.siteUrl,
      });
    }

    if (!pageData.pageInfo.hasNextPage) break;
    await sleep(600);
  }

  return dedupeEntries(entries);
}

export async function loadWikiSeedFile(): Promise<WikiBirthdayEntry[]> {
  try {
    const raw = await fs.readFile(WIKI_SEED_PATH, "utf8");
    return JSON.parse(raw) as WikiBirthdayEntry[];
  } catch {
    return [];
  }
}

export async function writeWikiSeedFile(entries: WikiBirthdayEntry[]) {
  await fs.mkdir(path.dirname(WIKI_SEED_PATH), { recursive: true });
  await fs.writeFile(WIKI_SEED_PATH, JSON.stringify(entries, null, 2), "utf8");
}

function parseIsoBirthday(
  value: string | null | undefined,
): { month: number; day: number } | null {
  if (!value) return null;
  const m = value.match(/(\d{4}|0000)-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function parseDateCell(text: string): { month: number; day: number } | null {
  const mdy = text.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i,
  );
  if (mdy) {
    return { month: MONTHS[mdy[1].toLowerCase()], day: Number(mdy[2]) };
  }
  const numeric = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (numeric) {
    return { month: Number(numeric[1]), day: Number(numeric[2]) };
  }
  return null;
}

function dedupeEntries(entries: WikiBirthdayEntry[]): WikiBirthdayEntry[] {
  const map = new Map<string, WikiBirthdayEntry>();
  for (const e of entries) {
    const key = `${slugify(e.name)}-${e.birthMonth}-${e.birthDay}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Coverage-fill scrape pipeline:
 * 1) Jikan/MAL (when up)
 * 2) optional WIKI_BIRTHDAY_URL HTML table
 * 3) AniList deep pages (structured list)
 * 4) committed data/wiki-seed.json
 * Persists a refreshed wiki-seed when live sources return data.
 */
export async function scrapeWikiBirthdays(): Promise<WikiBirthdayEntry[]> {
  const all: WikiBirthdayEntry[] = [];

  try {
    const probe = await fetch("https://api.jikan.moe/v4/top/characters?page=1", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (probe.ok) {
      const jikan = await scrapeJikanBirthdays({ maxPages: 2 });
      console.log(`Wiki: Jikan returned ${jikan.length} birthdays`);
      all.push(...jikan);
    } else {
      console.warn(`Wiki: Jikan probe status ${probe.status} — skipping`);
    }
  } catch (err) {
    console.warn("Wiki: Jikan scrape failed:", err);
  }

  const wikiUrl = process.env.WIKI_BIRTHDAY_URL;
  if (wikiUrl) {
    try {
      const table = await scrapeFandomBirthdayTable(wikiUrl);
      console.log(`Wiki: HTML table returned ${table.length} birthdays`);
      all.push(...table);
    } catch (err) {
      console.warn("Wiki: HTML scrape failed:", err);
    }
  }

  try {
    const deep = await scrapeAniListBirthdayList({ startPage: 16, maxPages: 6 });
    console.log(`Wiki: AniList deep list returned ${deep.length} birthdays`);
    all.push(...deep);
  } catch (err) {
    console.warn("Wiki: AniList deep list failed:", err);
  }

  const seed = await loadWikiSeedFile();
  if (seed.length) {
    console.log(`Wiki: seed file contributed ${seed.length} birthdays`);
    all.push(...seed);
  }

  const merged = dedupeEntries(all);

  if (merged.length > seed.length) {
    await writeWikiSeedFile(merged);
  }

  return merged;
}
