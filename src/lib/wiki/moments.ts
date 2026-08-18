import * as cheerio from "cheerio";
import { promises as fs } from "fs";
import path from "path";
import { slugify } from "@/lib/utils";
import type { MomentKind } from "@/lib/types";

export type ScrapedMoment = {
  title: string;
  summary: string | null;
  kind: MomentKind;
  franchise: string | null;
  image: string | null;
  month: number;
  day: number;
  year: number | null;
  significance: number;
  wikiUrl: string | null;
  source: "wiki" | "anilist" | "seed";
  tags: string[];
};

const UA =
  "AnimeBirthdayCalendar/1.0 (+https://github.com/animebirthday; JP media tracker)";

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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const SEED_PATH = path.join(process.cwd(), "data", "moments-seed.json");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseFlexibleDate(
  text: string,
): { month: number; day: number; year: number | null } | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const mdy = cleaned.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
  );
  if (mdy) {
    return {
      month: MONTHS[mdy[1].toLowerCase()],
      day: Number(mdy[2]),
      year: mdy[3] ? Number(mdy[3]) : null,
    };
  }
  const iso = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const numeric = cleaned.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (numeric) {
    const year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    return { month: Number(numeric[1]), day: Number(numeric[2]), year };
  }
  return null;
}

function dedupe(moments: ScrapedMoment[]): ScrapedMoment[] {
  const map = new Map<string, ScrapedMoment>();
  for (const m of moments) {
    const key = `${slugify(m.title)}-${m.month}-${m.day}-${m.kind}`;
    const prev = map.get(key);
    if (!prev || m.significance > prev.significance) map.set(key, m);
  }
  return [...map.values()];
}

async function wikiParseHtml(title: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "text");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("redirects", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    parse?: { text?: string };
    error?: { code: string };
  };
  if (json.error || !json.parse?.text) return null;
  return json.parse.text;
}

function scrapeReleaseTable(
  html: string,
  opts: {
    franchise: string;
    kind: MomentKind;
    significance: number;
    pageUrl: string;
    tags?: string[];
  },
): ScrapedMoment[] {
  const $ = cheerio.load(html);
  const out: ScrapedMoment[] = [];

  $("table.wikitable tr, table.infobox ~ table tr, table tr").each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length < 2) return;

    const texts = cells
      .toArray()
      .map((c) => $(c).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let date: ReturnType<typeof parseFlexibleDate> = null;
    let title = "";
    for (const t of texts) {
      const d = parseFlexibleDate(t);
      if (d && !date) date = d;
    }
    // Prefer linked title in first/second cell
    const link =
      $(row).find("td a").first().text().trim() ||
      $(row).find("i a").first().text().trim() ||
      texts.find((t) => !parseFlexibleDate(t) && t.length > 2) ||
      "";
    title = link.replace(/\[.*?\]/g, "").trim();
    if (!date || !title || title.length < 2) return;
    if (/^title$|^film$|^release/i.test(title)) return;

    out.push({
      title: `${title} release`,
      summary: `${opts.franchise} release anniversary`,
      kind: opts.kind,
      franchise: opts.franchise,
      image: null,
      month: date.month,
      day: date.day,
      year: date.year,
      significance: opts.significance,
      wikiUrl: opts.pageUrl,
      source: "wiki",
      tags: opts.tags ?? [
        opts.franchise.toLowerCase(),
        "release",
        "release-anniversary",
      ],
    });
  });

  return out;
}

/** Godzilla / kaiju film release dates from Wikipedia. */
export async function scrapeGodzillaFilms(): Promise<ScrapedMoment[]> {
  const page = "List_of_Godzilla_films";
  const html = await wikiParseHtml(page);
  if (!html) return [];
  return scrapeReleaseTable(html, {
    franchise: "Godzilla",
    kind: "kaiju",
    significance: 70,
    pageUrl: `https://en.wikipedia.org/wiki/${page}`,
    tags: ["godzilla", "kaiju", "release"],
  });
}

export async function scrapeGameraFilms(): Promise<ScrapedMoment[]> {
  const page = "List_of_Gamera_films";
  const html = await wikiParseHtml(page);
  if (!html) return [];
  return scrapeReleaseTable(html, {
    franchise: "Gamera",
    kind: "kaiju",
    significance: 62,
    pageUrl: `https://en.wikipedia.org/wiki/${page}`,
    tags: ["gamera", "kaiju", "release"],
  });
}

export async function scrapeUltramanSeries(): Promise<ScrapedMoment[]> {
  const page = "List_of_Ultraman_series";
  const html = await wikiParseHtml(page);
  if (!html) return [];
  return scrapeReleaseTable(html, {
    franchise: "Ultraman",
    kind: "kaiju",
    significance: 64,
    pageUrl: `https://en.wikipedia.org/wiki/${page}`,
    tags: ["ultraman", "kaiju", "tokusatsu"],
  });
}

export async function scrapeGhibliFilms(): Promise<ScrapedMoment[]> {
  const page = "List_of_Studio_Ghibli_works";
  const html = await wikiParseHtml(page);
  if (!html) return [];
  return scrapeReleaseTable(html, {
    franchise: "Studio Ghibli",
    kind: "release_anniversary",
    significance: 75,
    pageUrl: `https://en.wikipedia.org/wiki/${page}`,
    tags: ["ghibli", "film", "release", "release-anniversary"],
  });
}

export async function scrapeAnimeFilms(): Promise<ScrapedMoment[]> {
  const page = "List_of_highest-grossing_anime_films";
  const html = await wikiParseHtml(page);
  if (!html) return [];
  return scrapeReleaseTable(html, {
    franchise: "Anime Film",
    kind: "release_anniversary",
    significance: 65,
    pageUrl: `https://en.wikipedia.org/wiki/${page}`,
    tags: ["anime", "film", "release", "release-anniversary"],
  }).map((m) => ({
    ...m,
    // Keep original film title cleaner
    title: m.title.replace(/ release$/, " theatrical release"),
  }));
}

/** AniList popular anime premiere dates → annual release anniversaries. */
export async function scrapeAniListPremieres(options?: {
  maxPages?: number;
}): Promise<ScrapedMoment[]> {
  const maxPages = options?.maxPages ?? 10;
  const out: ScrapedMoment[] = [];
  let rateLimitHits = 0;
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english }
          coverImage { large }
          startDate { year month day }
          favourites
          popularity
          siteUrl
          genres
        }
      }
    }
  `;

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { page } }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 429) {
      rateLimitHits++;
      if (rateLimitHits > 3) {
        console.warn("Moments: AniList rate-limited — stopping premieres");
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
          media: Array<{
            id: number;
            title: { romaji: string; english: string | null };
            coverImage: { large: string | null };
            startDate: { year: number | null; month: number | null; day: number | null };
            favourites: number;
            popularity: number;
            siteUrl: string;
            genres: string[];
          }>;
        };
      };
    };
    const pageData = json.data?.Page;
    if (!pageData) break;

    for (const m of pageData.media) {
      if (!m.startDate?.month || !m.startDate?.day) continue;
      const name = m.title.english || m.title.romaji;
      const sig = Math.min(
        95,
        40 + Math.round(Math.log10(Math.max(m.favourites, 1)) * 12),
      );
      out.push({
        title: `${name} premiere`,
        summary: `Anime premiere anniversary`,
        kind: "release_anniversary",
        franchise: name,
        image: m.coverImage.large,
        month: m.startDate.month,
        day: m.startDate.day,
        year: m.startDate.year,
        significance: sig,
        wikiUrl: m.siteUrl,
        source: "anilist",
        tags: [
          "premiere",
          "anilist",
          "release-anniversary",
          ...(m.genres ?? []).slice(0, 3).map((g) => g.toLowerCase()),
        ],
      });
    }
    if (!pageData.pageInfo.hasNextPage) break;
    await sleep(600);
  }
  return out;
}

export async function loadMomentsSeed(): Promise<ScrapedMoment[]> {
  try {
    const raw = await fs.readFile(SEED_PATH, "utf8");
    return JSON.parse(raw) as ScrapedMoment[];
  } catch {
    return [];
  }
}

export async function writeMomentsSeed(moments: ScrapedMoment[]) {
  await fs.mkdir(path.dirname(SEED_PATH), { recursive: true });
  await fs.writeFile(SEED_PATH, JSON.stringify(moments, null, 2), "utf8");
}

/**
 * Scrape-heavy moments pipeline:
 * seed → Wikipedia (Godzilla, Ghibli, anime films) → AniList premieres → optional WIKI_MOMENTS_URL
 */
export async function scrapeSignificantMoments(): Promise<ScrapedMoment[]> {
  const all: ScrapedMoment[] = [];

  const seed = await loadMomentsSeed();
  console.log(`Moments: seed ${seed.length}`);
  all.push(...seed);

  try {
    const godzilla = await scrapeGodzillaFilms();
    console.log(`Moments: Godzilla ${godzilla.length}`);
    all.push(...godzilla);
  } catch (err) {
    console.warn("Moments: Godzilla scrape failed", err);
  }
  await sleep(400);

  try {
    const gamera = await scrapeGameraFilms();
    console.log(`Moments: Gamera ${gamera.length}`);
    all.push(...gamera);
  } catch (err) {
    console.warn("Moments: Gamera scrape failed", err);
  }
  await sleep(400);

  try {
    const ultraman = await scrapeUltramanSeries();
    console.log(`Moments: Ultraman ${ultraman.length}`);
    all.push(...ultraman);
  } catch (err) {
    console.warn("Moments: Ultraman scrape failed", err);
  }
  await sleep(400);

  try {
    const ghibli = await scrapeGhibliFilms();
    console.log(`Moments: Ghibli ${ghibli.length}`);
    all.push(...ghibli);
  } catch (err) {
    console.warn("Moments: Ghibli scrape failed", err);
  }
  await sleep(400);

  try {
    const films = await scrapeAnimeFilms();
    console.log(`Moments: anime films ${films.length}`);
    all.push(...films);
  } catch (err) {
    console.warn("Moments: anime films scrape failed", err);
  }
  await sleep(400);

  try {
    // Cap premieres so curated combat/death/kaiju seeds stay visible in feeds
    const premieres = await scrapeAniListPremieres({ maxPages: 4 });
    console.log(`Moments: AniList premieres ${premieres.length}`);
    all.push(...premieres);
  } catch (err) {
    console.warn("Moments: AniList premieres failed", err);
  }

  const wikiUrl = process.env.WIKI_MOMENTS_URL;
  if (wikiUrl) {
    try {
      const res = await fetch(wikiUrl, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        const extra = scrapeReleaseTable(html, {
          franchise: "Custom Wiki",
          kind: "cultural",
          significance: 60,
          pageUrl: wikiUrl,
          tags: ["wiki", "custom"],
        });
        console.log(`Moments: custom wiki ${extra.length}`);
        all.push(...extra);
      }
    } catch (err) {
      console.warn("Moments: custom wiki failed", err);
    }
  }

  const merged = dedupe(all);
  // Persist scrape harvest into seed for resilience when sources fail next time
  const forSeed = merged.filter(
    (m) => m.source === "seed" || m.kind === "combat" || m.kind === "death" || m.kind === "kaiju",
  );
  if (forSeed.length >= seed.length) {
    await writeMomentsSeed(
      dedupe([
        ...seed,
        ...forSeed.filter(
          (m) =>
            m.source === "seed" ||
            (m.kind !== "release" && m.kind !== "release_anniversary"),
        ),
      ]),
    );
  }
  return merged;
}
