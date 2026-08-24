import { NextResponse } from "next/server";
import { buildMonthDigest } from "@/lib/briefing/monthDigest";
import {
  fallbackBriefFromDigest,
  writeMonthlyBrief,
} from "@/lib/briefing/claudeBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  // Default dry for GET without flag? No — cron wants full generate.
  // dryRun only skips nothing now (no Twilio); kept for API compatibility.
  return raw === "1" || raw === "true";
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = isDryRun(request);

  try {
    const digest = await buildMonthDigest();

    let brief: string;
    let briefSource: "claude" | "fallback" = "claude";
    let aiSkipped: string | null = null;

    try {
      brief = await writeMonthlyBrief(digest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (dryRun) {
        brief = fallbackBriefFromDigest(digest);
        briefSource = "fallback";
        aiSkipped = message;
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "Claude briefing unavailable",
            detail: message,
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      briefSource,
      aiSkipped,
      digest,
      brief,
      briefChars: brief.length,
      delivery:
        "iMessage via mule LaunchAgent (scripts/send-briefing-imessage.mjs) — not Twilio",
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
