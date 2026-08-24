import { NextResponse } from "next/server";
import { buildMonthDigest } from "@/lib/briefing/monthDigest";
import {
  fallbackBriefFromDigest,
  writeMonthlyBrief,
} from "@/lib/briefing/grokBrief";
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
    let briefSource: "grok" | "fallback" = "grok";
    let grokSkipped: string | null = null;

    try {
      brief = await writeMonthlyBrief(digest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (dryRun) {
        brief = fallbackBriefFromDigest(digest);
        briefSource = "fallback";
        grokSkipped = message;
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "Grok briefing unavailable",
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
        briefSource,
        grokSkipped,
        digest,
        brief,
        briefChars: brief.length,
      });
    }

    if (!smsConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Twilio / BRIEFING_SMS_TO not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, BRIEFING_SMS_TO.",
          brief,
          briefChars: brief.length,
        },
        { status: 503 },
      );
    }

    const { sid } = await sendSms(brief);
    return NextResponse.json({
      ok: true,
      sid,
      briefChars: brief.length,
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
