import { BirthdayCalendar } from "@/components/BirthdayCalendar";
import { getCalendarMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;
  const data = await getCalendarMonth(year, month);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
        Anime calendar · Month
      </p>
      <p className="mb-10 max-w-lg text-sm text-[var(--muted)]">
        Anime - Birthday takes the cell when present; otherwise Anime - Combat,
        Premiere / Premiere anniversary, Kaiju, Death, and other types. Counts
        include both.
      </p>
      <BirthdayCalendar year={data.year} month={data.month} byDay={data.byDay} />
    </div>
  );
}
