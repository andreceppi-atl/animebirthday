import { NextResponse } from "next/server";
import { getBiggestThisWeek, getUpcomingCharacters } from "@/lib/queries";
import type { SortMode, TypeFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "60");
  const limit = Number(searchParams.get("limit") ?? "80");
  const q = searchParams.get("q") ?? undefined;
  const sort = (searchParams.get("sort") as SortMode | null) ?? "relevance";
  const type = (searchParams.get("type") as TypeFilter | null) ?? "birthday";
  const demo = searchParams.get("demo") ?? undefined;
  const minFavourites = Number(searchParams.get("minFavourites") ?? "0");

  const [upcoming, biggest] = await Promise.all([
    getUpcomingCharacters({ days, limit, q, sort, type, demo, minFavourites }),
    getBiggestThisWeek(5),
  ]);

  return NextResponse.json({
    upcoming,
    biggest,
    meta: { days, sort, q, demo, type },
  });
}
