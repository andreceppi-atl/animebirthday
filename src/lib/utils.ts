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

/** Next occurrence of month/day from a reference date (year-agnostic birthdays). */
export function nextBirthdayDate(
  birthMonth: number,
  birthDay: number,
  from: Date = new Date(),
): Date {
  const year = from.getFullYear();
  const candidate = new Date(year, birthMonth - 1, birthDay);
  candidate.setHours(0, 0, 0, 0);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  if (candidate < start) {
    return new Date(year + 1, birthMonth - 1, birthDay);
  }
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
