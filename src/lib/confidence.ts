import { normalizeMomentKind } from "@/lib/utils";

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function confidentMinFavourites(): number {
  return envInt("CONFIDENT_MIN_FAVOURITES", 500);
}

export function confidentMinMomentSignificance(): number {
  return envInt("CONFIDENT_MIN_MOMENT_SIGNIFICANCE", 50);
}

export function isConfidentCharacter(c: {
  source: string;
  anilistId: number | null;
  favourites: number;
  birthMonth: number;
  birthDay: number;
}): boolean {
  if (c.source !== "anilist") return false;
  if (c.anilistId == null) return false;
  if (!c.birthMonth || !c.birthDay) return false;
  if (c.favourites < confidentMinFavourites()) return false;
  return true;
}

export function isConfidentMoment(m: {
  source: string;
  significance: number;
  year: number | null;
  kind: string;
}): boolean {
  const kind = normalizeMomentKind(m.kind);
  if (m.significance < confidentMinMomentSignificance() && m.source !== "anilist") {
    return false;
  }
  // Actual-premiere claims need a year; anniversary may omit but prefer year when present
  if (kind === "release_anniversary" && m.source === "anilist" && m.year == null) {
    return false;
  }
  return true;
}
