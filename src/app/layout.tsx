import type { Metadata } from "next";
import { Syne, Figtree } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AnimeBirthday — Creator calendar",
  description:
    "Upcoming anime character birthdays ranked by popularity — with show demos and TikTok hashtags for edits.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${syne.variable} ${figtree.variable} h-full`}>
      <body className="grain atmosphere relative min-h-full flex flex-col antialiased">
        <SiteHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 border-t border-[var(--line)] py-8 text-center text-xs text-[var(--muted)]">
          Data from AniList + public birthday calendars. TikTok links open on TikTok.
        </footer>
      </body>
    </html>
  );
}
