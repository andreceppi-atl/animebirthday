"use client";

import { useState, useTransition } from "react";

type Result = {
  title: string;
  artist: string | null;
  ugcVolume: number;
  videoCount?: number;
  soundCount?: number;
  last7Days: number | null;
  last24Hours: number | null;
  imageUrl?: string | null;
};

export function ChartexPanel({
  defaultQuery,
  characterSlug,
  momentSlug,
}: {
  defaultQuery: string;
  characterSlug?: string;
  momentSlug?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [pending, startTransition] = useTransition();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [stamped, setStamped] = useState<string | null>(null);

  function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setStamped(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/chartex/search?q=${encodeURIComponent(query.trim())}`,
      );
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setResults(data.results ?? []);
      if (data.error) setError(data.error);
    });
  }

  function stampTop() {
    const slug = characterSlug || momentSlug;
    if (!slug || !results[0]) return;
    startTransition(async () => {
      const res = await fetch("/api/chartex/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          ugcVolume: results[0].ugcVolume,
          kind: momentSlug ? "moment" : "character",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to stamp UGC");
        return;
      }
      setStamped(
        `Saved UGC volume ${results[0].ugcVolume.toLocaleString()} to ${momentSlug ? "moment" : "character"}`,
      );
    });
  }

  return (
    <section className="space-y-4 border border-[var(--line)] bg-[var(--surface)]/30 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            ChartEx check
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Search TikTok song / sound volume for this anime (upload noise signal).
          </p>
        </div>
        {configured === false && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--accent)]">
            Creds missing
          </span>
        )}
      </div>

      <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Anime / song title"
          className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={pending || !query.trim()}
          className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50"
        >
          {pending ? "…" : "Lookup"}
        </button>
      </form>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {stamped && <p className="text-xs text-[var(--accent-soft)]">{stamped}</p>}

      {results.length > 0 && (
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {results.slice(0, 6).map((r, i) => (
            <div
              key={`${r.title}-${i}`}
              className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-2 text-sm"
            >
              <div className="flex min-w-0 items-start gap-2">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-[var(--ink)]">{r.title}</p>
                  {r.artist && (
                    <p className="truncate text-xs text-[var(--muted)]">{r.artist}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                <p className="text-[var(--accent)]">
                  {(r.videoCount ?? r.ugcVolume).toLocaleString()} videos
                </p>
                {r.soundCount != null && r.soundCount > 0 && (
                  <p>{r.soundCount.toLocaleString()} sounds</p>
                )}
                {r.last7Days != null && (
                  <p>
                    7d {r.last7Days > 0 ? "+" : ""}
                    {r.last7Days.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
          {(characterSlug || momentSlug) && (
            <button
              type="button"
              onClick={stampTop}
              className="text-xs uppercase tracking-wider text-[var(--accent)] hover:underline"
            >
              Stamp top result as {momentSlug ? "moment" : "character"} UGC
            </button>
          )}
        </div>
      )}

      {!results.length && !error && configured !== false && (
        <p className="text-xs text-[var(--muted)]">
          Run a lookup to preview ChartEx volume for posting timing.
        </p>
      )}
    </section>
  );
}
