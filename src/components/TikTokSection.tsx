"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TikTokEmbed } from "./TikTokEmbed";

type Video = {
  id: number;
  videoUrl: string;
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  embedHtml: string | null;
};

export function TikTokSection({
  slug,
  videos,
}: {
  slug: string;
  videos: Video[];
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/characters/${slug}/tiktok`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add video");
        return;
      }
      setUrl("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)]">
          Edit embeds
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Paste a TikTok video URL to embed an edit on this page.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@user/video/…"
          className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Embed"}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        {videos.map((v) => (
          <div key={v.id} className="space-y-2">
            <TikTokEmbed html={v.embedHtml} />
            {v.title && (
              <p className="line-clamp-2 text-xs text-[var(--muted)]">{v.title}</p>
            )}
          </div>
        ))}
        {!videos.length && (
          <p className="text-sm text-[var(--muted)]">
            No embeds yet — add a viral edit URL above, or open the hashtag links to hunt.
          </p>
        )}
      </div>
    </section>
  );
}
