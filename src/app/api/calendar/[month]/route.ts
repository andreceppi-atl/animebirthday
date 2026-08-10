import { NextResponse } from "next/server";
import { getCalendarMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ month: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { month: monthParam } = await params;
  // Accept YYYY-MM or just MM
  let year = new Date().getFullYear();
  let month = Number(monthParam);

  if (monthParam.includes("-")) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m;
  }

  if (!month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const data = await getCalendarMonth(year, month);
  return NextResponse.json(data);
}
