import { NextResponse } from "next/server";
import {
  getBiggestThisWeek,
  getTopPriorityThisMonth,
  getUpcomingCharacters,
} from "@/lib/queries";
import type { SortMode, TypeFilter } from "@/lib/queries";
import type { MomentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "60");
  const limit = Number(searchParams.get("limit") ?? "80");
  const q = searchParams.get("q") ?? undefined;
  const sort = (searchParams.get("sort") as SortMode | null) ?? "date";
  const type = (searchParams.get("type") as TypeFilter | null) ?? "birthday";
  const demo = searchParams.get("demo") ?? undefined;
  const momentKind =
    (searchParams.get("momentKind") as MomentKind | null) ?? undefined;
  const minFavourites = Number(searchParams.get("minFavourites") ?? "0");

  const [upcoming, biggest, monthPriority] = await Promise.all([
    getUpcomingCharacters({
      days,
      limit,
      q,
      sort,
      type,
      demo,
      momentKind,
      minFavourites,
    }),
    getBiggestThisWeek(5),
    getTopPriorityThisMonth(),
  ]);

  return NextResponse.json({
    upcoming,
    biggest,
    monthPriority,
    meta: { days, sort, q, demo, type, momentKind },
  });
}
