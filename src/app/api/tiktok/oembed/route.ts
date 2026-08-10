import { NextResponse } from "next/server";
import { fetchTikTokOEmbed, isValidTikTokUrl } from "@/lib/tiktok/oembed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url || !isValidTikTokUrl(url)) {
    return NextResponse.json({ error: "Valid TikTok video url required" }, { status: 400 });
  }

  try {
    const data = await fetchTikTokOEmbed(url);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "oEmbed failed" },
      { status: 502 },
    );
  }
}
