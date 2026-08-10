import Link from "next/link";
import { UpcomingList } from "@/components/UpcomingList";
import {
  getBiggestThisWeek,
  getCharacterCount,
  getUpcomingCharacters,
} from "@/lib/queries";
import { formatBirthday } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [upcoming, biggest, count] = await Promise.all([
    getUpcomingCharacters({ days: 14, limit: 40 }),
    getBiggestThisWeek(1),
    getCharacterCount(),
  ]);

  const hero = biggest[0] ?? upcoming[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <section className="relative mb-14 min-h-[55vh] overflow-hidden sm:mb-20 sm:min-h-[60vh]">
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
            Who&apos;s coming up, who&apos;s biggest, what show — and the TikTok hashtags
            for the edit.
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
              Catalog empty — run <code className="text-[var(--accent)]">npm run seed</code>
            </p>
          )}
        </div>
      </section>

      {hero && (
        <section className="mb-14 animate-fade-up border-t border-[var(--line)] pt-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Biggest this week
          </p>
          <Link href={`/character/${hero.slug}`} className="group mt-3 block">
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)] transition group-hover:text-[var(--accent)] sm:text-4xl">
              {hero.nameFull}
            </h2>
            <p className="mt-2 text-[var(--muted)]">
              {formatBirthday(hero.birthMonth, hero.birthDay)}
              {hero.daysUntil === 0
                ? " · today"
                : ` · in ${hero.daysUntil} day${hero.daysUntil === 1 ? "" : "s"}`}
              {` · ${hero.favourites.toLocaleString()} AniList favs`}
              {hero.show
                ? ` · ${hero.show.titleEnglish || hero.show.titleRomaji}`
                : ""}
            </p>
            {hero.show?.demos?.length ? (
              <p className="mt-2 text-xs uppercase tracking-wider text-[var(--accent-soft)]">
                Popular with {hero.show.demos.join(" · ")}
              </p>
            ) : null}
          </Link>
        </section>
      )}

      <section id="upcoming" className="scroll-mt-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
              Upcoming · 14 days
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Sorted by date, then popularity — pick who to edit next.
            </p>
          </div>
          <span className="text-xs text-[var(--muted)]">{upcoming.length} chars</span>
        </div>
        <UpcomingList items={upcoming} />
      </section>
    </div>
  );
}
