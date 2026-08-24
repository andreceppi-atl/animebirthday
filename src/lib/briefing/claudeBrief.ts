import type { MonthDigest } from "@/lib/briefing/monthDigest";

const SYSTEM = `You are embedded in AnimeBirthday ops as a specialist in anime fandom, advertising creative, and TikTok/short-form trends.
Write a punchy monthly creator briefing for a music/entertainment brand team.
Rules:
- Only use facts present in the JSON digest. Do not invent birthdays, premieres, or sports outcomes.
- Clearly separate Actual Premiere vs Premiere Anniversary when present.
- Prefer actionable plays: hook angle, posting window, why it trends.
- Tone: sharp, commercial, no cringe, no purple prose.
- Output plain text SMS-friendly paragraphs. No markdown tables. Max ~1400 characters.`;

const MODELS = [
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
] as const;

const SMS_HARD_CAP = 1500;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string; type?: string };
};

async function callClaude(
  model: string,
  digest: MonthDigest,
  apiKey: string,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.7,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Month digest JSON:\n${JSON.stringify(digest)}`,
        },
      ],
    }),
  });

  const raw = await res.text();
  let parsed: AnthropicResponse | null = null;
  try {
    parsed = JSON.parse(raw) as AnthropicResponse;
  } catch {
    /* leave null */
  }

  if (!res.ok) {
    const detail =
      parsed?.error?.message ||
      raw.slice(0, 240) ||
      `Anthropic HTTP ${res.status}`;
    return { ok: false, status: res.status, detail };
  }

  const text = (parsed?.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!.trim())
    .join("\n")
    .trim();

  if (!text) {
    return { ok: false, status: 502, detail: "Empty Claude response" };
  }
  return { ok: true, text };
}

function truncateForSms(text: string): string {
  if (text.length <= SMS_HARD_CAP) return text;
  return `${text.slice(0, SMS_HARD_CAP - 1)}…`;
}

/**
 * Local fallback when ANTHROPIC_API_KEY is missing or all models fail —
 * used only by dryRun path via explicit opt-in from the API route.
 */
export function fallbackBriefFromDigest(digest: MonthDigest): string {
  const lines: string[] = [`AnimeBirthday · ${digest.monthLabel}`, ""];
  if (digest.birthdays.length > 0) {
    lines.push("Birthdays:");
    for (const b of digest.birthdays.slice(0, 8)) {
      lines.push(
        `· ${b.name} (${b.show || "—"}) ${b.date} · ${b.daysUntil}d · ${b.favourites} favs`,
      );
    }
    lines.push("");
  }
  if (digest.moments.length > 0) {
    lines.push("Moments:");
    for (const m of digest.moments.slice(0, 6)) {
      const timing = m.premiereTiming ? ` · ${m.premiereTiming}` : "";
      lines.push(`· ${m.title} · ${m.type}${timing} · ${m.date}`);
    }
    lines.push("");
  }
  if (digest.sportsPlays.length > 0) {
    lines.push("Sports plays:");
    for (const s of digest.sportsPlays.slice(0, 5)) {
      lines.push(`· ${s.creatorAsk}`);
    }
  }
  return truncateForSms(lines.join("\n").trim());
}

export async function writeMonthlyBrief(digest: MonthDigest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  let lastDetail = "No models tried";
  for (const model of MODELS) {
    const result = await callClaude(model, digest, apiKey);
    if (result.ok) {
      return truncateForSms(result.text);
    }
    lastDetail = `${model}: ${result.detail}`;
    // Fall through on not-found / invalid model
    if (result.status !== 404 && result.status !== 400) {
      throw new Error(`Claude briefing failed (${lastDetail})`);
    }
  }

  throw new Error(`Claude briefing failed after model fallbacks (${lastDetail})`);
}
