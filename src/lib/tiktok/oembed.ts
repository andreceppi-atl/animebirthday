export type OEmbedResult = {
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  html: string | null;
  providerUrl: string | null;
};

export function isValidTikTokUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname === "www.tiktok.com" ||
        u.hostname === "tiktok.com" ||
        u.hostname === "vm.tiktok.com") &&
      (u.pathname.includes("/video/") || u.hostname === "vm.tiktok.com")
    );
  } catch {
    return false;
  }
}

export async function fetchTikTokOEmbed(url: string): Promise<OEmbedResult> {
  const endpoint = new URL("https://www.tiktok.com/oembed");
  endpoint.searchParams.set("url", url);

  const res = await fetch(endpoint.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`TikTok oEmbed failed (${res.status})`);
  }

  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
    html?: string;
    provider_url?: string;
  };

  return {
    title: data.title ?? null,
    authorName: data.author_name ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    html: data.html ?? null,
    providerUrl: data.provider_url ?? null,
  };
}
