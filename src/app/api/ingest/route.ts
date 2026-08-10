import { NextResponse } from "next/server";
import { runFullIngest, ingestFromAniList, ingestFromWiki } from "@/lib/ingest";

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

  try {
    if (source === "anilist") {
      const result = await ingestFromAniList({ maxPages });
      return NextResponse.json({ results: [result] });
    }
    if (source === "wiki") {
      const result = await ingestFromWiki();
      return NextResponse.json({ results: [result] });
    }
    const results = await runFullIngest({ maxPages, includeWiki: true });
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
