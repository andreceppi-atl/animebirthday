export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function hashtagSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function extractDemos(genres: string[], tags: string[] = []): string[] {
  const pool = [...genres, ...tags].map((g) => g.trim());
  const demos = ["Shounen", "Shoujo", "Seinen", "Josei"].filter((d) =>
    pool.some((g) => g.toLowerCase() === d.toLowerCase()),
  );
  return demos;
}

export function monthDayKey(month: number, day: number): string {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days in month (1–12); handles leap years for February. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Next occurrence of month/day from a reference date (year-agnostic birthdays).
 * Feb 29 celebrates on Feb 28 in non-leap years (avoids JS Date rollover to Mar 1).
 */
export function nextBirthdayDate(
  birthMonth: number,
  birthDay: number,
  from: Date = new Date(),
): Date {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const year = start.getFullYear();

  const build = (y: number) => {
    const dim = new Date(y, birthMonth, 0).getDate();
    const day = Math.min(Math.max(1, birthDay), dim);
    const d = new Date(y, birthMonth - 1, day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  let candidate = build(year);
  if (candidate < start) candidate = build(year + 1);
  return candidate;
}

export function daysUntilBirthday(
  birthMonth: number,
  birthDay: number,
  from: Date = new Date(),
): number {
  const next = nextBirthdayDate(birthMonth, birthDay, from);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  return Math.round((next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatBirthday(month: number, day: number): string {
  const d = new Date(2000, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Legacy `release` kind is the same as release anniversary. */
export function normalizeMomentKind(
  kind: string | null | undefined,
): import("@/lib/types").MomentKind {
  if (kind === "release") return "release_anniversary";
  if (
    kind === "combat" ||
    kind === "death" ||
    kind === "release_anniversary" ||
    kind === "anniversary" ||
    kind === "cultural" ||
    kind === "kaiju" ||
    kind === "other"
  ) {
    return kind;
  }
  return "other";
}

export function formatMomentKind(kind: string | null | undefined): string {
  const labels: Record<import("@/lib/types").MomentKind, string> = {
    combat: "Combat",
    death: "Death",
    release: "Premiere anniversary",
    release_anniversary: "Premiere anniversary",
    anniversary: "Anniversary",
    cultural: "Cultural",
    kaiju: "Kaiju",
    other: "Other",
  };
  return labels[normalizeMomentKind(kind)];
}

/**
 * True when this release moment is the first airing / premiere itself
 * (original year matches the upcoming occurrence year), not a later anniversary.
 */
export function isActualPremiere(options: {
  momentKind?: string | null;
  year?: number | null;
  nextDate?: string | Date | null;
  from?: Date;
}): boolean {
  const kind = normalizeMomentKind(options.momentKind);
  if (kind !== "release_anniversary") return false;
  if (options.year == null || !Number.isFinite(options.year)) return false;

  let occurrenceYear: number;
  if (options.nextDate) {
    const next = new Date(options.nextDate);
    if (Number.isNaN(next.getTime())) return false;
    occurrenceYear = next.getFullYear();
  } else {
    occurrenceYear = (options.from ?? new Date()).getFullYear();
  }
  return options.year === occurrenceYear;
}

export function isReleaseMomentKind(kind?: string | null): boolean {
  const raw = (kind ?? "").toLowerCase();
  return (
    raw === "release" ||
    raw === "release_anniversary" ||
    normalizeMomentKind(kind) === "release_anniversary"
  );
}

/** Anime calendar row tag: Anime - Birthday | Anime - Premiere | Anime - Premiere anniversary | … */
export function animeCalendarTypeLabel(
  feedKind: "birthday" | "moment",
  momentKind?: string | null,
  options?: {
    year?: number | null;
    nextDate?: string | Date | null;
  },
): string {
  if (feedKind === "birthday") return "Anime - Birthday";
  if (isReleaseMomentKind(momentKind)) {
    return isActualPremiere({
      momentKind,
      year: options?.year,
      nextDate: options?.nextDate,
    })
      ? "Anime - Premiere"
      : "Anime - Premiere anniversary";
  }
  return `Anime - ${formatMomentKind(momentKind)}`;
}

/** Short badge copy for sports overlap / detail — premiere vs anniversary. */
export function premiereTimingBadge(options: {
  momentKind?: string | null;
  year?: number | null;
  nextDate?: string | Date | null;
}): string | null {
  if (!isReleaseMomentKind(options.momentKind)) return null;
  if (
    isActualPremiere({
      momentKind: options.momentKind,
      year: options.year,
      nextDate: options.nextDate,
    })
  ) {
    return options.year != null
      ? `Actual premiere · first airing ${options.year}`
      : "Actual premiere · first airing";
  }
  return options.year != null
    ? `Premiere anniversary · originally ${options.year}`
    : "Premiere anniversary · not a first airing";
}
