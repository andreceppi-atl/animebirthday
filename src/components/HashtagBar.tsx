"use client";

import { useState } from "react";
import { tiktokTagUrl } from "@/lib/tiktok/hashtags";

type Tag = { tag: string; kind: string };

export function HashtagBar({ tags }: { tags: Tag[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyAll() {
    const text = tags.map((t) => `#${t.tag}`).join(" ");
    await navigator.clipboard.writeText(text);
    setCopied("all");
    setTimeout(() => setCopied(null), 1500);
  }

  async function copyOne(tag: string) {
    await navigator.clipboard.writeText(`#${tag}`);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!tags.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-[var(--muted)]">TikTok hashtags</p>
        <button
          type="button"
          onClick={copyAll}
          className="text-xs uppercase tracking-wider text-[var(--accent)] hover:underline"
        >
          {copied === "all" ? "Copied" : "Copy all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <div key={t.tag} className="group flex items-center gap-1">
            <a
              href={tiktokTagUrl(t.tag)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)] transition hover:bg-[var(--accent)] hover:text-[var(--bg)]"
            >
              #{t.tag}
            </a>
            <button
              type="button"
              onClick={() => copyOne(t.tag)}
              className="text-[10px] uppercase tracking-wide text-[var(--muted)] opacity-0 transition group-hover:opacity-100"
              aria-label={`Copy #${t.tag}`}
            >
              {copied === t.tag ? "ok" : "copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
