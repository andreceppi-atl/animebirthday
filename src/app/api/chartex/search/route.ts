import { NextResponse } from "next/server";
import {
  hasChartexCredentials,
  searchChartexSongs,
  searchChartexTiktokSounds,
} from "@/lib/chartex/client";
import { updateCharacterUgc, updateMomentUgc } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const preferSounds = searchParams.get("sounds") === "1";

  if (!q.trim()) {
    return NextResponse.json({
      configured: hasChartexCredentials(),
      query: "",
      results: [],
      error: "Pass ?q=anime+title",
    });
  }

  const data = preferSounds
    ? await searchChartexTiktokSounds(q)
    : await searchChartexSongs(q);

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    slug?: string;
    ugcVolume?: number;
    kind?: "character" | "moment";
  };
  if (!body.slug || typeof body.ugcVolume !== "number") {
    return NextResponse.json(
      { error: "slug and ugcVolume required" },
      { status: 400 },
    );
  }
  try {
    if (body.kind === "moment") {
      await updateMomentUgc(body.slug, body.ugcVolume);
    } else {
      await updateCharacterUgc(body.slug, body.ugcVolume);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
