"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { UpcomingList, type UpcomingItem } from "@/components/UpcomingList";
import type { MomentKind } from "@/lib/types";
import { formatMomentKind } from "@/lib/utils";

type SortMode = "date" | "popularity" | "relevance" | "ugc";
type TypeFilter = "birthday" | "moment" | "all";

const SORTS: { id: SortMode; label: string }[] = [
  { id: "relevance", label: "Relevance" },
  { id: "popularity", label: "Popularity" },
  { id: "ugc", label: "UGC / volume" },
  { id: "date", label: "Date" },
];

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: "birthday", label: "Birthdays" },
  { id: "moment", label: "Moments" },
  { id: "all", label: "All" },
];

const MOMENT_KINDS: { id: MomentKind | ""; label: string }[] = [
  { id: "", label: "All kinds" },
  { id: "combat", label: "Combat" },
  { id: "death", label: "Death" },
  { id: "release_anniversary", label: "Release anniversary" },
  { id: "kaiju", label: "Kaiju" },
  { id: "anniversary", label: "Anniversary" },
  { id: "cultural", label: "Cultural" },
];

const DEMOS = ["", "Shounen", "Shoujo", "Seinen", "Josei"];

export function UpcomingExplorer({
  initialItems,
  initialDays = 60,
}: {
  initialItems: UpcomingItem[];
  initialDays?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState<SortMode>(
    (searchParams.get("sort") as SortMode) || "relevance",
  );
  const [type, setType] = useState<TypeFilter>(
    (searchParams.get("type") as TypeFilter) || "birthday",
  );
  const [momentKind, setMomentKind] = useState<MomentKind | "">(
    (searchParams.get("momentKind") as MomentKind) || "",
  );
  const [demo, setDemo] = useState(searchParams.get("demo") ?? "");
  const [days, setDays] = useState(
    Number(searchParams.get("days") ?? initialDays),
  );

  function syncUrl(next: {
    q?: string;
    sort?: SortMode;
    type?: TypeFilter;
    momentKind?: MomentKind | "";
    demo?: string;
    days?: number;
  }) {
    const params = new URLSearchParams();
    const qq = next.q ?? q;
    const ss = next.sort ?? sort;
    const tt = next.type ?? type;
    const mk = next.momentKind ?? momentKind;
    const dd = next.demo ?? demo;
    const dy = next.days ?? days;
    if (qq) params.set("q", qq);
    if (ss && ss !== "relevance") params.set("sort", ss);
    if (tt && tt !== "birthday") params.set("type", tt);
    if (mk) params.set("momentKind", mk);
    if (dd) params.set("demo", dd);
    if (dy !== 60) params.set("days", String(dy));
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/#upcoming", { scroll: false });
  }

  function fetchList(opts?: {
    q?: string;
    sort?: SortMode;
    type?: TypeFilter;
    momentKind?: MomentKind | "";
    demo?: string;
    days?: number;
  }) {
    const qq = opts?.q ?? q;
    const ss = opts?.sort ?? sort;
    const tt = opts?.type ?? type;
    const mk = opts?.momentKind ?? momentKind;
    const dd = opts?.demo ?? demo;
    const dy = opts?.days ?? days;
    startTransition(async () => {
      const params = new URLSearchParams({
        days: String(dy),
        limit: "100",
        sort: ss,
        type: tt,
      });
      if (qq) params.set("q", qq);
      if (dd) params.set("demo", dd);
      if (mk) params.set("momentKind", mk);
      const res = await fetch(`/api/upcoming?${params}`);
      const data = await res.json();
      setItems(data.upcoming ?? []);
    });
  }

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  return (
    <section id="upcoming" className="scroll-mt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
            Upcoming · {days} days
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Birthdays first for UGC prediction — flip to Moments for fights,
            release anniversaries, deaths, kaiju dates.
          </p>
        </div>
        <span className="text-xs text-[var(--muted)]">
          {pending ? "Updating…" : `${items.length} items`}
        </span>
      </div>

      <form
        className="mb-8 grid gap-3 border border-[var(--line)] bg-[var(--surface)]/40 p-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          syncUrl({ q });
          fetchList({ q });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search character, moment, franchise…"
          className="border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)]"
        >
          Search
        </button>

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setType(t.id);
                const nextKind = t.id === "birthday" ? "" : momentKind;
                if (t.id === "birthday") setMomentKind("");
                syncUrl({ type: t.id, momentKind: nextKind });
                fetchList({ type: t.id, momentKind: nextKind });
              }}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider transition ${
                type === t.id
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 hidden text-[var(--line)] sm:inline">|</span>
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSort(s.id);
                syncUrl({ sort: s.id });
                fetchList({ sort: s.id });
              }}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider transition ${
                sort === s.id
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
              }`}
            >
              {s.label}
            </button>
          ))}
          {type === "birthday" && (
            <>
              <span className="mx-1 hidden text-[var(--line)] sm:inline">|</span>
              {DEMOS.map((d) => (
                <button
                  key={d || "all"}
                  type="button"
                  onClick={() => {
                    setDemo(d);
                    syncUrl({ demo: d });
                    fetchList({ demo: d });
                  }}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider transition ${
                    demo === d
                      ? "border border-[var(--accent)] text-[var(--accent)]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"
                  }`}
                >
                  {d || "All demos"}
                </button>
              ))}
            </>
          )}
          {(type === "moment" || type === "all") && (
            <>
              <span className="mx-1 hidden text-[var(--line)] sm:inline">|</span>
              {MOMENT_KINDS.map((k) => (
                <button
                  key={k.id || "all-kinds"}
                  type="button"
                  onClick={() => {
                    setMomentKind(k.id);
                    syncUrl({ momentKind: k.id });
                    fetchList({ momentKind: k.id });
                  }}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider transition ${
                    momentKind === k.id
                      ? "border border-[var(--accent)] text-[var(--accent)]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]"
                  }`}
                  title={k.id ? formatMomentKind(k.id) : undefined}
                >
                  {k.label}
                </button>
              ))}
            </>
          )}
          <select
            value={days}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDays(next);
              syncUrl({ days: next });
              fetchList({ days: next });
            }}
            className="ml-auto border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--ink)]"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </div>
      </form>

      <UpcomingList items={items} />

      <p className="mt-6 text-xs text-[var(--muted)]">
        Birthdays stay the default UGC calendar. Moments cover combat peaks,
        deaths, release anniversaries, and kaiju/cultural dates.{" "}
        <Link href="/calendar" className="text-[var(--accent)] hover:underline">
          Open calendar
        </Link>
      </p>
    </section>
  );
}
