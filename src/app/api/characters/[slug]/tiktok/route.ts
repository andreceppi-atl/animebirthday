import { NextResponse } from "next/server";
import { addCharacterTikTokVideo } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const body = (await request.json()) as { url?: string };
  if (!body.url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const video = await addCharacterTikTokVideo(slug, body.url);
    return NextResponse.json(video);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add video" },
      { status: 400 },
    );
  }
}
