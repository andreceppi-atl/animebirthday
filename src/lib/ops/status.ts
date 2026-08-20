import { hasDatabaseUrl } from "@/lib/db";
import { pgCharacterCount, pgGetAllMoments } from "@/lib/db/postgres";
import { loadWorkingStore } from "@/lib/db/store";
import {
  getTopPriorityThisMonth,
  getUpcomingCharacters,
  type UpcomingItem,
} from "@/lib/queries";
import { rotatingAniListWindow, utcDayOfYear } from "@/lib/catalog/crawl";
import { formatMomentKind } from "@/lib/utils";

export type OpsFlag = {
  level: "ok" | "warn" | "fail";
  message: string;
};

export type OpsWindow = {
  id: "fetch" | "placement" | "surfacing";
  title: string;
  subtitle: string;
  ok: boolean;
  flags: OpsFlag[];
  metrics: Array<{ label: string; value: string }>;
  rows: Array<Record<string, string>>;
};

export type OpsDebugReport = {
  generatedAt: string;
  overallOk: boolean;
  windows: OpsWindow[];
};

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function itemLabel(item: UpcomingItem): string {
  if (item.feedKind === "moment") {
    return `${formatMomentKind(item.momentKind)} · ${item.nameFull}`;
  }
  return `Birthday · ${item.nameFull}`;
}

/**
 * Three aligned debug windows: fetch (crawl), placement (calendar feed),
 * surfacing (landing / priority). Used by /ops and /api/ops.
 */
export async function getOpsDebugReport(): Promise<OpsDebugReport> {
  const store = await loadWorkingStore();
  const rotation = rotatingAniListWindow({ pageCount: 10, cyclePages: 50 });
  const day = utcDayOfYear();

  const recentRuns = [...store.ingestRuns].slice(-16).reverse();
  const stuckRuns = store.ingestRuns.filter((r) => r.status === "running").length;
  const lastSuccessBySource = new Map<string, string>();
  for (const r of store.ingestRuns) {
    if (r.status === "success") {
      lastSuccessBySource.set(r.source, r.finishedAt || r.startedAt);
    }
  }

  let pgCharacters: number | null = null;
  let pgMoments: number | null = null;
  if (hasDatabaseUrl()) {
    try {
      pgCharacters = await pgCharacterCount();
      pgMoments = (await pgGetAllMoments()).length;
    } catch {
      /* non-fatal */
    }
  }

  const wikiStubs = store.characters.filter((c) => !c.anilistId).length;
  const withImage = store.characters.filter((c) => c.image).length;
  const withUgc = store.characters.filter((c) => c.ugcVolume != null).length;

  const fetchFlags: OpsFlag[] = [];
  if (stuckRuns > 0) {
    fetchFlags.push({
      level: "fail",
      message: `${stuckRuns} ingest run(s) still marked running`,
    });
  }
  if (store.moments.length < 100) {
    fetchFlags.push({
      level: "fail",
      message: `Moments catalog thin (${store.moments.length})`,
    });
  }
  if (store.characters.length < 400) {
    fetchFlags.push({
      level: "warn",
      message: `Character catalog below target (${store.characters.length})`,
    });
  }
  if (wikiStubs > 40) {
    fetchFlags.push({
      level: "warn",
      message: `${wikiStubs} wiki stubs still unlinked`,
    });
  }
  if (
    pgCharacters != null &&
    Math.abs(pgCharacters - store.characters.length) >= 25
  ) {
    fetchFlags.push({
      level: "fail",
      message: `Neon/local character drift (${pgCharacters} vs ${store.characters.length})`,
    });
  }
  if (pgMoments != null && pgMoments < 100) {
    fetchFlags.push({
      level: "fail",
      message: `Neon moments thin (${pgMoments})`,
    });
  }
  for (const src of ["anilist", "roster", "refresh", "checkup"] as const) {
    const last = lastSuccessBySource.get(src);
    if (!last) {
      fetchFlags.push({
        level: "warn",
        message: `No successful ${src} run in history window`,
      });
      continue;
    }
    const ageH = (Date.now() - Date.parse(last)) / 3_600_000;
    if (src === "anilist" && ageH > 36) {
      fetchFlags.push({
        level: "warn",
        message: `Last anilist success ${ago(last)}`,
      });
    }
  }
  if (!fetchFlags.length) {
    fetchFlags.push({
      level: "ok",
      message: "Crawl pipeline looks healthy",
    });
  }

  const [upcoming14, upcoming60, monthPriority] = await Promise.all([
    getUpcomingCharacters({ days: 14, limit: 200, sort: "date", type: "all" }),
    getUpcomingCharacters({ days: 60, limit: 300, sort: "date", type: "all" }),
    getTopPriorityThisMonth(),
  ]);

  const birthdays14 = upcoming14.filter((i) => i.feedKind === "birthday");
  const moments14 = upcoming14.filter((i) => i.feedKind === "moment");
  const birthdays60 = upcoming60.filter((i) => i.feedKind === "birthday");
  const moments60 = upcoming60.filter((i) => i.feedKind === "moment");

  const byKind = new Map<string, number>();
  for (const m of moments60) {
    const k = formatMomentKind(m.momentKind);
    byKind.set(k, (byKind.get(k) || 0) + 1);
  }

  const dayBuckets = new Map<number, { b: number; m: number; top?: UpcomingItem }>();
  for (const item of upcoming14) {
    const bucket = dayBuckets.get(item.daysUntil) ?? { b: 0, m: 0 };
    if (item.feedKind === "birthday") bucket.b++;
    else bucket.m++;
    if (!bucket.top || item.favourites > bucket.top.favourites) bucket.top = item;
    dayBuckets.set(item.daysUntil, bucket);
  }
  const thinDays: number[] = [];
  for (let d = 0; d <= 14; d++) {
    const b = dayBuckets.get(d);
    if (!b || b.b + b.m === 0) thinDays.push(d);
  }

  const placementFlags: OpsFlag[] = [];
  if (birthdays14.length < 8) {
    placementFlags.push({
      level: "warn",
      message: `Only ${birthdays14.length} birthdays in next 14 days`,
    });
  }
  if (moments14.length < 3) {
    placementFlags.push({
      level: "warn",
      message: `Only ${moments14.length} moments in next 14 days`,
    });
  }
  if (thinDays.length > 5) {
    placementFlags.push({
      level: "warn",
      message: `${thinDays.length} empty days in the next 2 weeks`,
    });
  }
  if (!placementFlags.length) {
    placementFlags.push({
      level: "ok",
      message: "Feed placement has coverage across the near window",
    });
  }

  const surfacingFlags: OpsFlag[] = [];
  if (!monthPriority.priority) {
    surfacingFlags.push({
      level: "fail",
      message: "No month priority hero available",
    });
  } else if (monthPriority.priority.daysUntil > 45) {
    surfacingFlags.push({
      level: "warn",
      message: `Hero is ${monthPriority.priority.daysUntil}d out — check month window`,
    });
  }
  if (!monthPriority.topBirthday) {
    surfacingFlags.push({
      level: "warn",
      message: "No birthday contender left this month",
    });
  }
  if (!surfacingFlags.length) {
    surfacingFlags.push({
      level: "ok",
      message: "Landing hero and contenders are populated",
    });
  }

  const fetchOk = !fetchFlags.some((f) => f.level === "fail");
  const placementOk = !placementFlags.some((f) => f.level === "fail");
  const surfacingOk = !surfacingFlags.some((f) => f.level === "fail");

  const windows: OpsWindow[] = [
    {
      id: "fetch",
      title: "Fetch",
      subtitle: "Crawls, roster, priority seed, Neon sync",
      ok: fetchOk,
      flags: fetchFlags,
      metrics: [
        { label: "Characters", value: String(store.characters.length) },
        { label: "Moments", value: String(store.moments.length) },
        { label: "Shows", value: String(store.shows.length) },
        { label: "Wiki stubs", value: String(wikiStubs) },
        { label: "With image", value: String(withImage) },
        { label: "Char UGC", value: String(withUgc) },
        {
          label: "AniList rotation",
          value: `p${rotation.startPage}–${rotation.startPage + rotation.pageCount - 1} (day ${day})`,
        },
        {
          label: "Neon chars",
          value: pgCharacters == null ? "n/a" : String(pgCharacters),
        },
        {
          label: "Neon moments",
          value: pgMoments == null ? "n/a" : String(pgMoments),
        },
        { label: "Stuck runs", value: String(stuckRuns) },
      ],
      rows: recentRuns.slice(0, 12).map((r) => ({
        Source: r.source,
        Status: r.status,
        When: ago(r.finishedAt || r.startedAt),
        Chars: String(r.charactersUpserted ?? 0),
        Moments: String(r.momentsUpserted ?? 0),
        Error: r.error ? r.error.slice(0, 80) : "—",
      })),
    },
    {
      id: "placement",
      title: "Placement",
      subtitle: "How dates land in the upcoming / calendar windows",
      ok: placementOk,
      flags: placementFlags,
      metrics: [
        { label: "Birthdays · 14d", value: String(birthdays14.length) },
        { label: "Moments · 14d", value: String(moments14.length) },
        { label: "Birthdays · 60d", value: String(birthdays60.length) },
        { label: "Moments · 60d", value: String(moments60.length) },
        { label: "Empty days · 14d", value: String(thinDays.length) },
        ...[...byKind.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([label, n]) => ({
            label: `Kind · ${label}`,
            value: String(n),
          })),
      ],
      rows: [...dayBuckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(0, 15)
        .map(([daysUntil, bucket]) => ({
          "In": daysUntil === 0 ? "Today" : `${daysUntil}d`,
          Birthdays: String(bucket.b),
          Moments: String(bucket.m),
          Top: bucket.top ? itemLabel(bucket.top) : "—",
          Favs: bucket.top ? String(bucket.top.favourites) : "—",
        })),
    },
    {
      id: "surfacing",
      title: "Surfacing",
      subtitle: "What creators see first on landing + feed",
      ok: surfacingOk,
      flags: surfacingFlags,
      metrics: [
        {
          label: "Month",
          value: monthPriority.monthLabel,
        },
        {
          label: "Hero",
          value: monthPriority.priority
            ? itemLabel(monthPriority.priority)
            : "—",
        },
        {
          label: "Hero in",
          value: monthPriority.priority
            ? `${monthPriority.priority.daysUntil}d`
            : "—",
        },
        {
          label: "Top birthday",
          value: monthPriority.topBirthday?.nameFull ?? "—",
        },
        {
          label: "Top moment",
          value: monthPriority.topMoment?.nameFull ?? "—",
        },
        {
          label: "Contenders",
          value: String(monthPriority.contenders.length),
        },
      ],
      rows: [
        ...(monthPriority.priority
          ? [
              {
                Slot: "Hero",
                Item: itemLabel(monthPriority.priority),
                When: `${monthPriority.priority.daysUntil}d`,
                Favs: String(monthPriority.priority.favourites),
              },
            ]
          : []),
        ...monthPriority.contenders
          .filter(
            (c) =>
              !(
                monthPriority.priority &&
                c.feedKind === monthPriority.priority.feedKind &&
                c.id === monthPriority.priority.id
              ),
          )
          .slice(0, 8)
          .map((c, i) => ({
            Slot: `Contender ${i + 1}`,
            Item: itemLabel(c),
            When: `${c.daysUntil}d`,
            Favs: String(c.favourites),
          })),
        ...upcoming14
          .filter((i) => i.feedKind === "birthday")
          .slice(0, 5)
          .map((c, i) => ({
            Slot: `Feed B${i + 1}`,
            Item: c.nameFull,
            When: `${c.daysUntil}d`,
            Favs: String(c.favourites),
          })),
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallOk: fetchOk && placementOk && surfacingOk,
    windows,
  };
}

export function authorizeOps(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "");
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  return (
    auth === `Bearer ${secret}` ||
    cronHeader === secret ||
    q === secret ||
    process.env.NODE_ENV !== "production"
  );
}
