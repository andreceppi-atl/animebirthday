/**
 * Twilio SMS sender for monthly briefing.
 * To number comes only from BRIEFING_SMS_TO (E.164) — never hardcode.
 */

export type SendSmsResult = { sid: string };

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim() &&
      process.env.BRIEFING_SMS_TO?.trim(),
  );
}

export async function sendSms(body: string): Promise<SendSmsResult> {
  const sid = requireEnv("TWILIO_ACCOUNT_SID");
  const token = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_FROM_NUMBER");
  const to = requireEnv("BRIEFING_SMS_TO");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({
    From: from,
    To: to,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const raw = await res.text();
  let parsed: { sid?: string; message?: string; error_message?: string } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* leave empty */
  }

  if (!res.ok) {
    const detail =
      parsed.message ||
      parsed.error_message ||
      raw.slice(0, 240) ||
      `Twilio HTTP ${res.status}`;
    throw new Error(`Twilio SMS failed: ${detail}`);
  }

  if (!parsed.sid) {
    throw new Error("Twilio SMS failed: missing message SID");
  }

  return { sid: parsed.sid };
}
