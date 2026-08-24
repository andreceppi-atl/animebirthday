import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartexPanel } from "@/components/ChartexPanel";
import { HashtagBar } from "@/components/HashtagBar";
import { TikTokSection } from "@/components/TikTokSection";
import { getCharacterBySlug } from "@/lib/queries";
import {
  daysUntilBirthday,
  formatBirthday,
  nextBirthdayDate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function CharacterPage({ params }: Props) {
  const { slug } = await params;
  const character = await getCharacterBySlug(slug);
  if (!character) notFound();

  const daysUntil = daysUntilBirthday(character.birthMonth, character.birthDay);
  const nextDate = nextBirthdayDate(character.birthMonth, character.birthDay);
  const showTitle =
    character.show?.titleEnglish || character.show?.titleRomaji || null;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8">
      <Link
        href="/"
        className="text-xs uppercase tracking-wider text-[var(--muted)] hover:text-[var(--accent)]"
      >
        ← Upcoming
      </Link>

      <section className="relative mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div className="animate-fade-up space-y-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
            {daysUntil === 0
              ? "Anime - Birthday · today"
              : `Anime - Birthday · in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
            {character.nameFull}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {formatBirthday(character.birthMonth, character.birthDay)}
            {" · "}
            next {nextDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {` · ${character.favourites.toLocaleString()} favs`}
          </p>

          {showTitle && (
            <div className="space-y-2 border-t border-[var(--line)] pt-5">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                From
              </p>
              <p className="text-xl text-[var(--ink)]">{showTitle}</p>
              {character.alsoShows?.length ? (
                <div className="space-y-1 pt-1">
                  <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                    Also appears in
                  </p>
                  <ul className="space-y-0.5">
                    {character.alsoShows.map((s) => (
                      <li key={s.id} className="text-sm text-[var(--ink)]">
                        {s.titleEnglish || s.titleRomaji}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {character.show?.demos?.length ? (
                <p className="text-sm text-[var(--accent-soft)]">
                  Popular with {character.show.demos.join(" · ")} audiences
                </p>
              ) : null}
              {character.show?.genres?.length ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {character.show.genres.slice(0, 6).map((g) => (
                    <span
                      key={g}
                      className="text-[11px] uppercase tracking-wider text-[var(--muted)]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden bg-[var(--surface)] animate-fade-up">
          {character.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.image}
              alt={character.nameFull}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--muted)]">
              No image
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--bg)]/50 to-transparent" />
        </div>
      </section>

      <section className="mt-14 space-y-4 border-t border-[var(--line)] pt-10">
        <HashtagBar tags={character.hashtags} />
        <div className="flex flex-wrap gap-3 pt-2">
          {character.hashtags.slice(0, 4).map((h) => (
            <a
              key={h.tag}
              href={`https://www.tiktok.com/tag/${encodeURIComponent(h.tag)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Search #{h.tag} on TikTok
            </a>
          ))}
        </div>
      </section>

      <div className="mt-10">
        <ChartexPanel
          defaultQuery={showTitle || character.nameFull}
          characterSlug={character.slug}
        />
        {character.ugcVolume != null && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Stamped UGC volume: {character.ugcVolume.toLocaleString()}
            {character.ugcUpdatedAt
              ? ` · updated ${new Date(character.ugcUpdatedAt).toLocaleDateString()}`
              : ""}
          </p>
        )}
      </div>

      <div className="mt-14 border-t border-[var(--line)] pt-10">
        <TikTokSection slug={character.slug} videos={character.tiktokVideos} />
      </div>

      {character.wikiUrl && (
        <p className="mt-10 text-xs text-[var(--muted)]">
          Source:{" "}
          <a
            href={character.wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {character.source === "wiki" ? "Wiki / MAL" : "AniList"}
          </a>
        </p>
      )}
    </div>
  );
}
