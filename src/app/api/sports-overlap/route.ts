import { NextResponse } from "next/server";
import { getSportsAnimeOverlaps, SPORTS, type Sport } from "@/lib/sports";

export const dynamic = "force-dynamic";

function parseSport(raw: string | null): Sport | "all" {
  if (!raw || raw === "all") return "all";
  if ((SPORTS as readonly string[]).includes(raw)) return raw as Sport;
  return "all";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "60") || 60;
  const sport = parseSport(searchParams.get("sport"));
  const limit = Number(searchParams.get("limit") ?? "60") || 60;

  const result = await getSportsAnimeOverlaps({ days, sport, limit });

  return NextResponse.json({
    sports: result.sports,
    overlaps: result.overlaps,
    meta: {
      days: result.days,
      sport: result.sport,
      sportsCount: result.sports.length,
      overlapCount: result.overlaps.length,
      proximityCount: result.overlaps.filter((o) => o.hasProximity).length,
    },
  });
}
