import Link from "next/link";
import type { CharacterRecord, ShowRecord } from "@/lib/types";

type DayChars = Array<CharacterRecord & { show: ShowRecord | null }>;

export function BirthdayCalendar({
  year,
  month,
  byDay,
}: {
  year: number;
  month: number;
  byDay: Record<number, DayChars>;
}) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
  });

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
          {monthName} {year}
        </h2>
        <div className="flex gap-3 text-sm">
          <Link
            href={`/calendar?year=${prev.y}&month=${prev.m}`}
            className="text-[var(--muted)] hover:text-[var(--accent)]"
          >
            ← Prev
          </Link>
          <Link
            href={`/calendar?year=${next.y}&month=${next.m}`}
            className="text-[var(--muted)] hover:text-[var(--accent)]"
          >
            Next →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-[var(--line)] text-center text-[10px] uppercase tracking-wider text-[var(--muted)] sm:text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-[var(--bg)] py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-[var(--line)]">
        {cells.map((cell, i) => {
          if (cell.day === null) {
            return <div key={`e-${i}`} className="min-h-24 bg-[var(--bg)] sm:min-h-28" />;
          }
          const chars = byDay[cell.day] ?? [];
          const top = chars[0];
          return (
            <div
              key={cell.day}
              className="min-h-24 bg-[var(--bg)] p-1.5 sm:min-h-28 sm:p-2"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs text-[var(--muted)]">{cell.day}</span>
                {chars.length > 0 && (
                  <span className="text-[10px] text-[var(--accent)]">{chars.length}</span>
                )}
              </div>
              {top && (
                <Link
                  href={`/character/${top.slug}`}
                  className="mt-1 block"
                  title={top.nameFull}
                >
                  <div className="relative mx-auto aspect-[3/4] w-full max-w-[72px] overflow-hidden bg-[var(--surface)]">
                    {top.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={top.image}
                        alt={top.nameFull}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center p-1 text-[9px] leading-tight text-[var(--muted)]">
                        {top.nameFull}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 hidden truncate text-[10px] text-[var(--ink)] sm:block">
                    {top.nameFull}
                  </p>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
