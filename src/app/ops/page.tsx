import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOpsDebugReport,
  type OpsFlag,
  type OpsWindow,
} from "@/lib/ops/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = {
  searchParams: Promise<{ secret?: string }>;
};

function flagClass(level: OpsFlag["level"]) {
  if (level === "fail") return "text-red-700";
  if (level === "warn") return "text-amber-700";
  return "text-[var(--accent)]";
}

function WindowPanel({ window }: { window: OpsWindow }) {
  return (
    <section
      id={window.id}
      className="border border-[var(--line)] bg-[var(--surface)]/50"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            Debug window
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)]">
            {window.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{window.subtitle}</p>
        </div>
        <span
          className={`text-xs uppercase tracking-wider ${
            window.ok ? "text-[var(--accent)]" : "text-red-700"
          }`}
        >
          {window.ok ? "Aligned" : "Needs attention"}
        </span>
      </header>

      <ul className="space-y-1 border-b border-[var(--line)] px-5 py-3">
        {window.flags.map((f) => (
          <li
            key={f.message}
            className={`text-sm ${flagClass(f.level)}`}
          >
            <span className="uppercase tracking-wider text-[10px]">
              {f.level}
            </span>
            {" · "}
            {f.message}
          </li>
        ))}
      </ul>

      <div className="grid gap-px border-b border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
        {window.metrics.map((m) => (
          <div key={m.label} className="bg-[var(--bg)] px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {m.label}
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {window.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {Object.keys(window.rows[0]).map((k) => (
                  <th key={k} className="px-4 py-2 font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {window.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--line)]/70 text-[var(--ink)]"
                >
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-4 py-2 align-top text-[var(--muted)]">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function OpsPage({ searchParams }: Props) {
  const params = await searchParams;
  const secret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "");
  if (process.env.NODE_ENV === "production") {
    if (!secret || params.secret !== secret) notFound();
  }

  const report = await getOpsDebugReport();

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
        Ops · debug
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--ink)]">
            Pipeline alignment
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Three windows for the automated loop: fetch into the catalog, place
            into date windows, surface on the creator landing feed.
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <p
            className={
              report.overallOk ? "text-[var(--accent)]" : "text-red-700"
            }
          >
            {report.overallOk ? "Overall aligned" : "Overall needs attention"}
          </p>
          <p className="mt-1">{new Date(report.generatedAt).toLocaleString()}</p>
          <Link
            href="/api/ops"
            className="mt-2 inline-block text-[var(--accent)] hover:underline"
          >
            JSON →
          </Link>
        </div>
      </div>

      <nav className="mt-8 flex flex-wrap gap-2 text-xs uppercase tracking-wider">
        {report.windows.map((w) => (
          <a
            key={w.id}
            href={`#${w.id}`}
            className="border border-[var(--line)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            {w.title}
          </a>
        ))}
      </nav>

      <div className="mt-8 space-y-8">
        {report.windows.map((w) => (
          <WindowPanel key={w.id} window={w} />
        ))}
      </div>
    </div>
  );
}
