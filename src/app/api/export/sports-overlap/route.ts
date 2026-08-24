import { NextResponse } from "next/server";
import {
  filterOverlapsForView,
  getSportsAnimeOverlaps,
  parseSportsView,
  SPORTS,
  type Sport,
} from "@/lib/sports";
import {
  buildSportsOverlapExportRows,
  sportsOverlapRowsToCsv,
} from "@/lib/export/sportsOverlapCsv";

export const dynamic = "force-dynamic";

function parseSport(raw: string | null): Sport | "all" {
  if (!raw || raw === "all") return "all";
  if ((SPORTS as readonly string[]).includes(raw)) return raw as Sport;
  return "all";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "31") || 31;
  const sport = parseSport(searchParams.get("sport"));
  const view = parseSportsView(searchParams.get("view") ?? undefined);
  const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 500);

  const result = await getSportsAnimeOverlaps({ days, sport, limit });
  const overlaps = filterOverlapsForView(result.overlaps, view);
  const rows = buildSportsOverlapExportRows(overlaps);
  const csv = sportsOverlapRowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `animebirthday-sports-overlap-${stamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
