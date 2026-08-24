import Link from "next/link";
import {
  getSportsAnimeOverlaps,
  sportLabel,
  SPORTS,
  type Sport,
  type SportsAnimeOverlap,
  type UpcomingSportsEvent,
} from "@/lib/sports";
import { formatBirthday, formatMomentKind } from "@/lib/utils";
import type { MomentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    sport?: string;
    days?: string;
  }>;
};

function parseSport(raw: string | undefined): Sport | "all" {
  if (!raw || raw === "all") return "all";
  if ((SPORTS as readonly string[]).includes(raw)) return raw as Sport;
  return "all";
}

function itemHref(item: SportsAnimeOverlap["animeItem"]) {
  return item.feedKind === "moment"
    ? `/moment/${item.slug}`
    : `/character/${item.slug}`;
}

function itemKindLabel(item: SportsAnimeOverlap["animeItem"]) {
  if (item.feedKind === "moment") {
    return item.momentKind
      ? `Moment · ${formatMomentKind(item.momentKind as MomentKind)}`
      : "Moment";
  }
  return "Birthday";
}

function daysLabel(daysUntil: number) {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "in 1 day";
  return `in ${daysUntil} days`;
}

function SportChips({
  active,
  days,
}: {
  active: Sport | "all";
  days: number;
}) {
  const chips: Array<{ id: Sport | "all"; label: string; emphasize?: boolean }> =
    [
      { id: "all", label: "All sports" },
      { id: "mlb", label: "MLB", emphasize: true },
      { id: "nfl", label: "NFL" },
      { id: "nba", label: "NBA" },
      { id: "soccer", label: "Soccer" },
      { id: "olympics", label: "Olympics" },
      { id: "combat_sports", label: "Combat" },
      { id: "tennis", label: "Tennis" },
      { id: "nhl", label: "NHL" },
      { id: "other", label: "Other" },
    ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const selected = active === chip.id;
        const href =
          chip.id === "all"
            ? days === 60
              ? "/sports"
              : `/sports?days=${days}`
            : days === 60
              ? `/sports?sport=${chip.id}`
              : `/sports?sport=${chip.id}&days=${days}`;
        return (
          <Link
            key={chip.id}
            href={href}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider transition ${
              selected
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : chip.emphasize
                  ? "border border-[var(--accent)]/50 text-[var(--accent)] hover:border-[var(--accent)]"
                  : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}

function SportsHeatRow({ event }: { event: UpcomingSportsEvent }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line)]/60 py-3 last:border-0">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wider text-[var(--accent)]">
        {sportLabel(event.sport)}
      </span>
      <span className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
        {event.title}
      </span>
      <span className="text-sm text-[var(--muted)]">
        {event.dateLabel}
        {" · "}
        {daysLabel(event.daysUntil)}
        {" · heat "}
        {event.significance}
      </span>
      {event.league ? (
        <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          {event.league}
          {event.team ? ` · ${event.team}` : ""}
        </span>
      ) : null}
    </li>
  );
}

function OverlapRow({ overlap }: { overlap: SportsAnimeOverlap }) {
  const { sportsEvent: event, animeItem: item, proximityMatches, hasProximity } =
    overlap;
  return (
    <li
      className={`border-b border-[var(--line)]/60 py-5 last:border-0 ${
        hasProximity ? "pl-3 border-l-2 border-l-[var(--accent)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--accent)]">
          {sportLabel(event.sport)} × {itemKindLabel(item)}
        </span>
        <span className="text-sm text-[var(--muted)]">
          {formatBirthday(event.month, event.day)} · {daysLabel(event.daysUntil)}
        </span>
        {hasProximity ? (
          <span className="text-[11px] uppercase tracking-wider text-[var(--accent-soft)]">
            Proximity match
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Sports heat
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            {event.title}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{event.summary}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Anime calendar
          </p>
          <Link
            href={itemHref(item)}
            className="group mt-1 block font-[family-name:var(--font-display)] text-xl text-[var(--ink)] transition group-hover:text-[var(--accent)] hover:text-[var(--accent)]"
          >
            {item.nameFull}
          </Link>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {item.show
              ? item.show.titleEnglish || item.show.titleRomaji
              : item.franchise || "—"}
            {item.favourites > 0
              ? ` · ${item.favourites.toLocaleString()} favs`
              : ""}
          </p>
        </div>
      </div>

      {proximityMatches.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--accent-soft)]">
          Why it fits:{" "}
          {[...new Set(proximityMatches.map((m) => m.hint))].join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

export default async function SportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const sport = parseSport(params.sport);
  const days = Number(params.days ?? "60") || 60;

  const { sports, overlaps } = await getSportsAnimeOverlaps({
    days,
    sport,
    limit: 80,
  });

  const proximityOverlaps = overlaps.filter((o) => o.hasProximity);
  const sameDayOverlaps = overlaps.filter((o) => !o.hasProximity);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <section className="relative mb-12 min-h-[36vh] overflow-hidden sm:mb-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 85% 20%, #3d5a8044, transparent 55%), radial-gradient(ellipse 50% 40% at 10% 80%, var(--glow), transparent 50%)",
          }}
        />
        <div className="relative max-w-2xl animate-fade-up space-y-5 pt-4 sm:pt-8">
          <p className="animate-pulse-soft text-xs uppercase tracking-[0.25em] text-[var(--accent)]">
            AnimeBirthday
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[0.95] tracking-tight text-[var(--ink)] sm:text-5xl md:text-6xl">
            Sports overlap
          </h1>
          <p className="max-w-lg text-base text-[var(--muted)] sm:text-lg">
            Ride sports social spikes with the anime birthday and moment
            calendar — MLB-first after recent heat, plus peer-culture events,
            with franchise proximity called out.
          </p>
        </div>
      </section>

      <section className="mb-10 animate-fade-up border-t border-[var(--line)] pt-8">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Filter · next {days} days
        </p>
        <SportChips active={sport} days={days} />
      </section>

      <section className="mb-14 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Upcoming sports heat
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] sm:text-3xl">
          High-signal dates ahead
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Curated anchors — Opening Day, All-Star, World Series windows, NFL
          kickoff, World Cup / Olympics when relevant.
        </p>
        {sports.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--muted)]">
            No sports events in this window
            {sport !== "all" ? ` for ${sportLabel(sport)}` : ""}. Try All sports
            or widen days.
          </p>
        ) : (
          <ul className="mt-6">
            {sports.map((event) => (
              <SportsHeatRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-14 animate-fade-up border-t border-[var(--line)] pt-10">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Same-day overlap
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)] sm:text-3xl">
          Anime calendar × sports
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Shared calendar days in the next {days} days. Left-accent rows are
          proximity matches (baseball ↔ Ace of Diamond, boxing ↔ Ippo, etc.).
        </p>

        {proximityOverlaps.length > 0 ? (
          <div className="mt-8">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent-soft)]">
              Proximity first · {proximityOverlaps.length}
            </p>
            <ul className="mt-2">
              {proximityOverlaps.map((o) => (
                <OverlapRow
                  key={`${o.sportsEvent.id}-${o.animeItem.feedKind}-${o.animeItem.id}`}
                  overlap={o}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {sameDayOverlaps.length > 0 ? (
          <div className="mt-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              Same day · timing plays · {sameDayOverlaps.length}
            </p>
            <ul className="mt-2">
              {sameDayOverlaps.slice(0, 40).map((o) => (
                <OverlapRow
                  key={`${o.sportsEvent.id}-${o.animeItem.feedKind}-${o.animeItem.id}`}
                  overlap={o}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {overlaps.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--muted)]">
            No same-day anime overlaps in this window. Check Upcoming or widen
            the filter.
          </p>
        ) : null}
      </section>

      <p className="text-xs text-[var(--muted)]">
        JSON:{" "}
        <Link
          href={`/api/sports-overlap?days=${days}${sport !== "all" ? `&sport=${sport}` : ""}`}
          className="text-[var(--accent)] hover:underline"
        >
          /api/sports-overlap
        </Link>
      </p>
    </div>
  );
}
