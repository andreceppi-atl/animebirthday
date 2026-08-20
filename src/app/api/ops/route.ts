import { NextResponse } from "next/server";
import { authorizeOps, getOpsDebugReport } from "@/lib/ops/status";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeOps(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await getOpsDebugReport();
  return NextResponse.json(report);
}
