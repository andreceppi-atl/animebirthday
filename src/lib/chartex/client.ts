const CHARTEX_BASE = "https://api.chartex.com/external/v1";

export type ChartexSong = {
  song_name?: string;
  title?: string;
  name?: string;
  artists?: string | Array<{ name?: string } | string>;
  artist?: string | { name?: string };
  song_image_url?: string;
  tiktok_total_video_count?: number | null;
  tiktok_last_7_days_video_count?: number | null;
  tiktok_last_24_hours_video_count?: number | null;
  tiktok_total_sound_count?: number | null;
  spotify_total_streams?: number | null;
  youtube_total_views?: number | null;
  [key: string]: unknown;
};

export type ChartexSearchResult = {
  configured: boolean;
  query: string;
  results: Array<{
    title: string;
    artist: string | null;
    ugcVolume: number;
    videoCount: number;
    soundCount: number;
    last7Days: number | null;
    last24Hours: number | null;
    imageUrl: string | null;
    raw: ChartexSong;
  }>;
  error?: string;
};

export function hasChartexCredentials(): boolean {
  return Boolean(process.env.CHARTEX_APP_ID && process.env.CHARTEX_APP_TOKEN);
}

function chartexHeaders(): HeadersInit {
  const appId = process.env.CHARTEX_APP_ID;
  const token = process.env.CHARTEX_APP_TOKEN;
  if (!appId || !token) {
    throw new Error("ChartEx credentials missing (CHARTEX_APP_ID / CHARTEX_APP_TOKEN)");
  }
  return {
    "X-APP-ID": appId,
    "X-APP-TOKEN": token,
    Accept: "application/json",
  };
}

function pickTitle(song: ChartexSong): string {
  return song.song_name || song.title || song.name || "Untitled";
}

function pickArtist(song: ChartexSong): string | null {
  if (typeof song.artists === "string") return song.artists;
  if (typeof song.artist === "string") return song.artist;
  if (song.artist && typeof song.artist === "object" && song.artist.name) {
    return song.artist.name;
  }
  if (Array.isArray(song.artists) && song.artists.length) {
    const first = song.artists[0];
    return typeof first === "string" ? first : first?.name ?? null;
  }
  return null;
}

function normalizeSong(song: ChartexSong) {
  const videoCount = Number(song.tiktok_total_video_count ?? 0) || 0;
  const soundCount = Number(song.tiktok_total_sound_count ?? 0) || 0;
  // Upload / UGC noise prefers video count; fall back to sounds
  const ugcVolume = videoCount > 0 ? videoCount : soundCount;
  const last7Days =
    song.tiktok_last_7_days_video_count == null
      ? null
      : Number(song.tiktok_last_7_days_video_count);
  const last24Hours =
    song.tiktok_last_24_hours_video_count == null
      ? null
      : Number(song.tiktok_last_24_hours_video_count);

  return {
    title: pickTitle(song),
    artist: pickArtist(song),
    ugcVolume,
    videoCount,
    soundCount,
    last7Days,
    last24Hours,
    imageUrl: song.song_image_url ?? null,
    raw: song,
  };
}

function extractItems(json: unknown): ChartexSong[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  if (Array.isArray(root)) return root as ChartexSong[];
  if (Array.isArray(root.items)) return root.items as ChartexSong[];
  if (Array.isArray(root.results)) return root.results as ChartexSong[];
  if (Array.isArray(root.data)) return root.data as ChartexSong[];
  if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.items)) return data.items as ChartexSong[];
    if (Array.isArray(data.results)) return data.results as ChartexSong[];
  }
  return [];
}

/**
 * Search ChartEx songs — TikTok video/sound volume for anime UGC signal.
 * GET /external/v1/songs/?search=&sort_platform=tiktok&sort_column=total_sound_count
 */
export async function searchChartexSongs(
  query: string,
  options?: { limit?: number },
): Promise<ChartexSearchResult> {
  const q = query.trim();
  if (!q) {
    return { configured: hasChartexCredentials(), query: q, results: [] };
  }

  if (!hasChartexCredentials()) {
    return {
      configured: false,
      query: q,
      results: [],
      error:
        "ChartEx not configured — add CHARTEX_APP_ID and CHARTEX_APP_TOKEN",
    };
  }

  const url = new URL(`${CHARTEX_BASE}/songs/`);
  url.searchParams.set("sort_platform", "tiktok");
  url.searchParams.set("sort_column", "total_sound_count");
  url.searchParams.set("search", q);
  url.searchParams.set("limit", String(options?.limit ?? 8));
  url.searchParams.set("page", "1");

  const res = await fetch(url.toString(), {
    headers: chartexHeaders(),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      configured: true,
      query: q,
      results: [],
      error: `ChartEx ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = await res.json();
  const results = extractItems(json).map(normalizeSong);

  return { configured: true, query: q, results };
}

export async function searchChartexTiktokSounds(query: string) {
  // Prefer songs chart (richer TikTok video metrics); sounds endpoint as soft fallback
  const songs = await searchChartexSongs(query);
  if (songs.results.length || !songs.configured) return songs;

  try {
    const url = new URL(`${CHARTEX_BASE}/tiktok-sounds/`);
    url.searchParams.set("search", query);
    url.searchParams.set("limit", "8");
    const res = await fetch(url.toString(), {
      headers: chartexHeaders(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return songs;
    const json = await res.json();
    const results = extractItems(json).map(normalizeSong);
    return { configured: true, query, results };
  } catch {
    return songs;
  }
}
