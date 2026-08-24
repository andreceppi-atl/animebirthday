import { promises as fs } from "fs";
import path from "path";
import type { SportsEventSeed, Sport } from "./types";
import { SPORTS } from "./types";

const SEED_PATH = path.join(process.cwd(), "data", "sports-events-seed.json");

function isSport(value: unknown): value is Sport {
  return typeof value === "string" && (SPORTS as readonly string[]).includes(value);
}

function normalizeEvent(raw: Record<string, unknown>): SportsEventSeed | null {
  if (typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  if (!isSport(raw.sport)) return null;
  const month = Number(raw.month);
  const day = Number(raw.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year =
    raw.year == null || raw.year === ""
      ? null
      : Number.isFinite(Number(raw.year))
        ? Number(raw.year)
        : null;

  const significance = Math.max(
    0,
    Math.min(100, Number(raw.significance) || 0),
  );

  return {
    id: raw.id,
    title: raw.title,
    sport: raw.sport,
    month,
    day,
    year,
    recurring: Boolean(raw.recurring),
    significance,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : [],
    league: typeof raw.league === "string" ? raw.league : null,
    team: typeof raw.team === "string" ? raw.team : null,
    animeProximityHints: Array.isArray(raw.animeProximityHints)
      ? raw.animeProximityHints.filter((t): t is string => typeof t === "string")
      : [],
  };
}

export async function loadSportsEventsSeed(): Promise<SportsEventSeed[]> {
  try {
    const raw = await fs.readFile(SEED_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) =>
        row && typeof row === "object"
          ? normalizeEvent(row as Record<string, unknown>)
          : null,
      )
      .filter((e): e is SportsEventSeed => Boolean(e));
  } catch {
    return [];
  }
}

export function sportLabel(sport: Sport): string {
  switch (sport) {
    case "mlb":
      return "MLB";
    case "nba":
      return "NBA";
    case "nfl":
      return "NFL";
    case "nhl":
      return "NHL";
    case "soccer":
      return "Soccer";
    case "tennis":
      return "Tennis";
    case "combat_sports":
      return "Combat";
    case "olympics":
      return "Olympics";
    default:
      return "Other";
  }
}
