import { Suspense } from "react";
import Link from "next/link";
import { UpcomingExplorer } from "@/components/UpcomingExplorer";
import {
  getCharacterCount,
  getTopPriorityThisMonth,
  getUpcomingCharacters,
  type UpcomingItem,
} from "@/lib/queries";
import type { MomentKind } from "@/lib/types";
import { formatBirthday, animeCalendarTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    demo?: string;
    days?: string;
    type?: string;
    momentKind?: string;
  }>;
};

function itemHref(item: UpcomingItem) {
  return item.feedKind === "moment"
    ? `/moment/${item.slug}`
    : `/character/${item.slug}`;
}

function itemKindLabel(item: UpcomingItem) {
  return animeCalendarTypeLabel(item.feedKind, item.momentKind, {
    year: item.year,
    nextDate: item.nextDate,
  });
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const days = Number(params.days ?? "60");
  const sort = "date" as const;
  const type = (params.type as "birthday" | "moment" | "all") || "birthday";
  const momentKind = (params.momentKind as MomentKind | undefined) || undefined;

  const [upcoming, monthPriority, count] = await Promise.all([
    getUpcomingCharacters({
      days,
      limit: 100,
      q: params.q,
      sort,
      demo: params.demo,
      type,
      momentKind,
    }),
    getTopPriorityThisMonth(),
    getCharacterCount(),
  ]);

  const hero = monthPriority.priority ?? upcoming[0] ?? null;
  const secondary = monthPriority.contenders.filter((c) => c.id !== hero?.id).slice(0, 2);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <section className="relative mb-14 min-h-[50vh] overflow-hidden sm:mb-16 sm:min-h-[55vh]">
        {hero?.image && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-full sm:w-[58%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.image}
              alt=""
              className="h-full w-full object-cover object-top opacity-40 sm:opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg)] via-[var(--bg)]/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-[var(--bg)]/40" />
          </div>
        )}

        <div className="relative max-w-xl animate-fade-up space-y-6 pt-6 sm:pt-10">
          <p className="animate-pulse-soft text-xs uppercase tracking-[0.25em] text-[var(--accent)]">
            AnimeBirthday
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-tight text-[var(--ink)] sm:text-6xl md:text-7xl">
            Post the next
            <span className="block text-[var(--accent)]">character birthday.</span>
          </h1>
          <p className="max-w-md text-base text-[var(--muted)] sm:text-lg">
            Next 2 months of birthdays (default) plus significant JP media
            moments — fights, deaths, release anniversaries, kaiju dates.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="#upcoming"
              className="bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110"
            >
              See upcoming
            </Link>
            <Link
              href="/calendar"
              className="border border-[var(--line)] px-5 py-3 text-sm text-[var(--ink)] transition hover:border-[var(--accent)]"
            >
              Open calendar
            </Link>
          </div>
          {count === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Catalog empty — run{" "}
              <code className="text-[var(--accent)]">npm run saturate</code>
            </p>
          )}
        </div>
      </section>

      {hero && (
        <section className="mb-14 animate-fade-up border-t border-[var(--line)] pt-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            Top priority · {monthPriority.monthLabel}
          </p>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Highest-demand birthday or moment still left this month — hit this
            first.
          </p>
          <Link href={itemHref(hero)} className="group mt-5 block">
            <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {itemKindLabel(hero)}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] transition group-hover:text-[var(--accent)] sm:text-4xl">
              {hero.nameFull}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              {formatBirthday(hero.birthMonth, hero.birthDay)}
              {hero.daysUntil === 0
                ? " · today"
                : ` · in ${hero.daysUntil} day${hero.daysUntil === 1 ? "" : "s"}`}
              {` · ${hero.favourites.toLocaleString()} AniList favs`}
              {hero.ugcScore > 0 && !hero.ugcEstimated
                ? ` · ${hero.ugcScore.toLocaleString()} UGC`
                : ""}
              {hero.show
                ? ` · ${hero.show.titleEnglish || hero.show.titleRomaji}`
                : hero.franchise
                  ? ` · ${hero.franchise}`
                  : ""}
            </p>
            {hero.show?.demos?.length ? (
              <p className="mt-2 text-xs uppercase tracking-wider text-[var(--accent-soft)]">
                Popular with {hero.show.demos.join(" · ")}
              </p>
            ) : null}
          </Link>

          {secondary.length > 0 && (
            <div className="mt-8 space-y-4 border-t border-[var(--line)] pt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Also this month
              </p>
              <ul className="space-y-3">
                {secondary.map((item) => (
                  <li key={`${item.feedKind}-${item.id}`}>
                    <Link
                      href={itemHref(item)}
                      className="group flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                        {itemKindLabel(item)}
                      </span>
                      <span className="text-lg text-[var(--ink)] transition group-hover:text-[var(--accent)]">
                        {item.nameFull}
                      </span>
                      <span className="text-sm text-[var(--muted)]">
                        {formatBirthday(item.birthMonth, item.birthDay)}
                        {item.daysUntil === 0
                          ? " · today"
                          : ` · in ${item.daysUntil}d`}
                        {` · ${item.favourites.toLocaleString()} favs`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <Suspense
        fallback={<p className="text-sm text-[var(--muted)]">Loading filters…</p>}
      >
        <UpcomingExplorer initialItems={upcoming} initialDays={days} />
      </Suspense>
    </div>
  );
}
