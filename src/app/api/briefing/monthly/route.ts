import { NextResponse } from "next/server";
import { buildMonthDigest } from "@/lib/briefing/monthDigest";
import { writeMonthlyBrief } from "@/lib/briefing/claudeBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || cronHeader === secret;
}

function isDryRun(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("dryRun") ?? searchParams.get("dryrun");
  return raw === "1" || raw === "true";
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = isDryRun(request);

  try {
    const digest = await buildMonthDigest();
    const brief = await writeMonthlyBrief(digest);

    return NextResponse.json({
      ok: true,
      dryRun,
      briefSource: "summary",
      digest,
      brief,
      briefChars: brief.length,
      delivery:
        "iMessage via mule LaunchAgent (scripts/send-briefing-imessage.mjs)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
