#!/usr/bin/env node
/**
 * Fetch the monthly Claude brief from prod and deliver via macOS iMessage
 * (same approach as sold-out tracker — no Twilio).
 *
 * Usage (from repo root, on the mule Mac with Messages signed in):
 *   node scripts/send-briefing-imessage.mjs
 *   node scripts/send-briefing-imessage.mjs --dry-print   # print only
 *
 * Env (from .env.local or process env):
 *   CRON_SECRET
 *   BRIEFING_IMESSAGE_TO or BRIEFING_SMS_TO  (E.164, e.g. +19147042663)
 *   BRIEFING_API_URL  (default https://animebirthday.vercel.app/api/briefing/monthly)
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function sendIMessage(phone, text) {
  const cleaned = text
    .replace(/×/g, "x")
    .replace(/®/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  const quoted = `"${cleaned.replace(/"/g, '""')}"`;
  const script = `
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${phone}" of targetService
  send ${quoted} to targetBuddy
end tell
`;
  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "osascript failed").trim(),
    );
  }
}

async function main() {
  loadEnvLocal();
  const dryPrint = process.argv.includes("--dry-print");
  const secret = process.env.CRON_SECRET?.trim();
  const phone = (
    process.env.BRIEFING_IMESSAGE_TO ||
    process.env.BRIEFING_SMS_TO ||
    ""
  ).trim();
  const apiUrl = (
    process.env.BRIEFING_API_URL ||
    "https://animebirthday.vercel.app/api/briefing/monthly"
  ).trim();

  if (!secret) {
    console.error("CRON_SECRET missing (.env.local)");
    process.exit(1);
  }
  if (!dryPrint && !phone) {
    console.error("BRIEFING_IMESSAGE_TO or BRIEFING_SMS_TO missing");
    process.exit(1);
  }

  const url = new URL(apiUrl);
  // Prefer real Claude brief; dryRun=1 only allows fallback if Claude fails
  url.searchParams.set("dryRun", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const data = await res.json();
  if (!res.ok || !data.ok || !data.brief) {
    console.error("Briefing fetch failed", res.status, data);
    process.exit(1);
  }

  console.log(
    `briefSource=${data.briefSource} chars=${data.briefChars ?? data.brief.length}`,
  );

  if (dryPrint) {
    console.log(data.brief);
    return;
  }

  // iMessage is happier with shorter chunks if needed
  const chunks = [];
  const body = String(data.brief);
  const max = 1400;
  if (body.length <= max) {
    chunks.push(body);
  } else {
    let rest = body;
    while (rest.length > 0) {
      chunks.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const part =
      chunks.length > 1
        ? `(${i + 1}/${chunks.length})\n${chunks[i]}`
        : chunks[i];
    sendIMessage(phone, part);
    console.log(`sent chunk ${i + 1}/${chunks.length} → ${phone}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
