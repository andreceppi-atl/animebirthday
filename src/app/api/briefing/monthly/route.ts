import { NextResponse } from "next/server";
import { buildMonthDigest } from "@/lib/briefing/monthDigest";
import {
  fallbackBriefFromDigest,
  writeMonthlyBrief,
} from "@/lib/briefing/claudeBrief";
import { sendSms, smsConfigured } from "@/lib/briefing/sms";

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

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        smsSkipped: true,
        smsNote: "Twilio optional — set TWILIO_* + BRIEFING_SMS_TO when ready",
        briefSource,
        aiSkipped,
        digest,
        brief,
        briefChars: brief.length,
      });
    }

    // Without Twilio yet: succeed with brief so monthly cron stays green
    if (!smsConfigured()) {
      return NextResponse.json({
        ok: true,
        smsSkipped: true,
        smsNote:
          "Twilio not configured yet. Brief generated; add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, BRIEFING_SMS_TO to enable SMS.",
        briefSource,
        brief,
        briefChars: brief.length,
      });
    }

    const { sid } = await sendSms(brief);
    return NextResponse.json({
      ok: true,
      sid,
      briefChars: brief.length,
      briefSource,
      brief,
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
