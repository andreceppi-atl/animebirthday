import Link from "next/link";
import { formatBirthday, formatMomentKind } from "@/lib/utils";
import type { FeedKind, MomentKind } from "@/lib/types";

export type UpcomingItem = {
  feedKind: FeedKind;
  id: number;
  slug: string;
  nameFull: string;
  image: string | null;
  birthMonth: number;
  birthDay: number;
  favourites: number;
  daysUntil: number;
  ugcScore?: number;
  ugcEstimated?: boolean;
  relevance?: number;
  momentKind?: MomentKind;
  franchise?: string | null;
  summary?: string | null;
  year?: number | null;
  show: {
    titleEnglish: string | null;
    titleRomaji: string;
    demos: string[];
    genres: string[];
  } | null;
  alsoShows?: Array<{
    titleEnglish: string | null;
    titleRomaji: string;
  }>;
};

function hrefFor(item: UpcomingItem) {
  return item.feedKind === "moment"
    ? `/moment/${item.slug}`
    : `/character/${item.slug}`;
}

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  if (!items.length) {
    return (
      <div className="border border-dashed border-[var(--line)] px-6 py-16 text-center">
        <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          No dates match
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Widen the window, switch type filter, or run{" "}
          <code className="text-[var(--accent)]">npm run moments</code>.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item, index) => (
        <li
          key={`${item.feedKind}-${item.id}`}
          className="group animate-fade-up"
          style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
        >
          <Link
            href={hrefFor(item)}
            className="flex gap-4 py-5 transition hover:bg-[var(--surface)]/60 sm:gap-6"
          >
            <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-[var(--surface)] sm:h-24 sm:w-20">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt={item.nameFull}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-1 text-center text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {item.feedKind === "moment"
                    ? formatMomentKind(item.momentKind)
                    : "N/A"}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    item.feedKind === "birthday"
                      ? "text-[var(--accent)]"
                      : "text-[var(--accent-soft)]"
                  }`}
                >
                  {item.feedKind === "birthday"
                    ? "Birthday"
                    : formatMomentKind(item.momentKind)}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)] sm:text-2xl">
                  {item.nameFull}
                </h3>
                <span className="text-sm text-[var(--accent)]">
                  {item.daysUntil === 0
                    ? "Today"
                    : item.daysUntil === 1
                      ? "Tomorrow"
                      : `In ${item.daysUntil}d`}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {formatBirthday(item.birthMonth, item.birthDay)}
                {item.year ? ` · orig ${item.year}` : ""}
                {item.show
                  ? ` · ${item.show.titleEnglish || item.show.titleRomaji}`
                  : item.franchise
                    ? ` · ${item.franchise}`
                    : ""}
                {item.alsoShows?.length
                  ? ` · also ${item.alsoShows
                      .map((s) => s.titleEnglish || s.titleRomaji)
                      .join(", ")}`
                  : ""}
                {item.feedKind === "birthday"
                  ? ` · ${item.favourites.toLocaleString()} favs`
                  : ""}
                {item.ugcScore != null
                  ? ` · UGC ${item.ugcScore.toLocaleString()}${item.ugcEstimated ? "≈" : ""}`
                  : ""}
              </p>
              {item.summary && (
                <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">
                  {item.summary}
                </p>
              )}
              {(item.show?.demos?.length || item.show?.genres?.length) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(item.show.demos.length
                    ? item.show.demos
                    : item.show.genres.slice(0, 3)
                  ).map((d) => (
                    <span
                      key={d}
                      className="text-[11px] uppercase tracking-wider text-[var(--muted)]"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="hidden self-center text-xs uppercase tracking-widest text-[var(--muted)] transition group-hover:text-[var(--accent)] sm:block">
              Open →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
