import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartexPanel } from "@/components/ChartexPanel";
import { getMomentBySlug } from "@/lib/queries";
import {
  daysUntilBirthday,
  formatBirthday,
  formatMomentKind,
  nextBirthdayDate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function MomentPage({ params }: Props) {
  const { slug } = await params;
  const moment = await getMomentBySlug(slug);
  if (!moment) notFound();

  const daysUntil = daysUntilBirthday(moment.month, moment.day);
  const nextDate = nextBirthdayDate(moment.month, moment.day);
  const query = moment.franchise || moment.title;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-8">
      <Link
        href="/?type=moment"
        className="text-xs uppercase tracking-wider text-[var(--muted)] hover:text-[var(--accent)]"
      >
        ← Moments
      </Link>

      <section className="relative mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div className="animate-fade-up space-y-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent-soft)]">
            {formatMomentKind(moment.kind)}
            {daysUntil === 0
              ? " · today"
              : ` · in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
            {moment.title}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {formatBirthday(moment.month, moment.day)}
            {moment.year ? ` · ${moment.year}` : ""}
            {" · next "}
            {nextDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {` · significance ${moment.significance}`}
          </p>
          {moment.franchise && (
            <p className="text-[var(--accent)]">{moment.franchise}</p>
          )}
          {moment.summary && (
            <p className="max-w-xl text-[var(--muted)]">{moment.summary}</p>
          )}
          {moment.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {moment.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] uppercase tracking-wider text-[var(--muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden bg-[var(--surface)] animate-fade-up">
          {moment.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={moment.image}
              alt={moment.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-[var(--muted)]">
              <span className="text-xs uppercase tracking-[0.2em]">
                {formatMomentKind(moment.kind)}
              </span>
              <span className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                {moment.franchise || "JP media"}
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="mt-12">
        <ChartexPanel
          defaultQuery={query}
          characterSlug={undefined}
          momentSlug={moment.slug}
        />
      </div>

      {moment.wikiUrl && (
        <p className="mt-10 text-xs text-[var(--muted)]">
          Source:{" "}
          <a
            href={moment.wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {moment.source}
          </a>
        </p>
      )}
    </div>
  );
}
