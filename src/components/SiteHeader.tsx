import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="relative z-10 border-b border-[var(--line)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="group">
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)] sm:text-2xl">
            Anime<span className="text-[var(--accent)]">Birthday</span>
          </span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            Creator calendar
          </span>
        </Link>
        <nav className="flex gap-5 text-sm text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--accent)]">
            Upcoming
          </Link>
          <Link href="/calendar" className="hover:text-[var(--accent)]">
            Calendar
          </Link>
          <Link href="/sports" className="hover:text-[var(--accent)]">
            Sports
          </Link>
        </nav>
      </div>
    </header>
  );
}
