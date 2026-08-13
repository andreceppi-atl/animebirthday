import { NextResponse } from "next/server";
import {
  runFullIngest,
  ingestFromAniList,
  ingestFromWiki,
  ingestMoments,
  saturateBirthdayWindow,
} from "@/lib/ingest";
import { stampUpcomingUgc } from "@/lib/chartex/stamp";
import { factCheckCharacterShows } from "@/lib/factcheck/shows";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || cronHeader === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "all";
  const maxPages = Number(searchParams.get("pages") ?? "10");
  const windowDays = Number(searchParams.get("days") ?? "60");
  const limit = Number(searchParams.get("limit") ?? "40");
  const repair = searchParams.get("repair") !== "0";

  try {
    if (source === "anilist") {
      const result = await ingestFromAniList({ maxPages });
      return NextResponse.json({ results: [result] });
    }
    if (source === "wiki") {
      const result = await ingestFromWiki();
      return NextResponse.json({ results: [result] });
    }
    if (source === "moments") {
      const result = await ingestMoments();
      return NextResponse.json({ results: [result] });
    }
    if (source === "chartex" || source === "ugc") {
      const result = await stampUpcomingUgc({
        characterLimit: limit,
        momentLimit: Number(searchParams.get("moments") ?? "20"),
      });
      return NextResponse.json({ results: [result] });
    }
    if (source === "factcheck" || source === "factcheck-shows") {
      const result = await factCheckCharacterShows({
        repair,
        force: searchParams.get("force") === "1",
        limit: Number(searchParams.get("limit") ?? "200"),
        minFavourites: Number(searchParams.get("minFavourites") ?? "0"),
      });
      return NextResponse.json({ results: [result] });
    }
    if (source === "saturate" || source === "monthly") {
      const birthday = await saturateBirthdayWindow({
        windowDays,
        maxPages: Number(searchParams.get("pages") ?? "40"),
      });
      const moments = await ingestMoments();
      return NextResponse.json({ results: [birthday, moments] });
    }
    const results = await runFullIngest({
      maxPages,
      includeWiki: true,
      includeMoments: true,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
