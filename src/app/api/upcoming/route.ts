import { NextResponse } from "next/server";
import { getBiggestThisWeek, getUpcomingCharacters } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "14");
  const limit = Number(searchParams.get("limit") ?? "50");

  const [upcoming, biggest] = await Promise.all([
    getUpcomingCharacters({ days, limit }),
    getBiggestThisWeek(5),
  ]);

  return NextResponse.json({ upcoming, biggest });
}
