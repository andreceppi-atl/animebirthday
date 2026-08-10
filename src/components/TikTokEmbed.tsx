"use client";

import { useEffect } from "react";

export function TikTokEmbed({ html }: { html: string | null }) {
  useEffect(() => {
    const existing = document.querySelector(
      'script[src="https://www.tiktok.com/embed.js"]',
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.tiktok.com/embed.js";
      script.async = true;
      document.body.appendChild(script);
    } else {
      // Re-process embeds when new HTML is injected
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiktok = (window as any).tiktokEmbed;
      if (tiktok?.lib?.render) {
        tiktok.lib.render();
      }
    }
  }, [html]);

  if (!html) {
    return (
      <p className="text-sm text-[var(--muted)]">Embed unavailable for this video.</p>
    );
  }

  return (
    <div
      className="tiktok-embed-wrap overflow-hidden"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
