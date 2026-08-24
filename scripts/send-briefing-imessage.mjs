#!/usr/bin/env node
/**
 * Monthly iMessage brief — ONLY sends on the 1st of the month.
 *
 * Usage (mule Mac, Messages signed in):
 *   node scripts/send-briefing-imessage.mjs              # send if today is the 1st
 *   node scripts/send-briefing-imessage.mjs --dry-print  # print only (any day)
 *   node scripts/send-briefing-imessage.mjs --force      # send anyway (manual test)
 *
 * Env (.env.local):
 *   CRON_SECRET
 *   BRIEFING_IMESSAGE_TO or BRIEFING_SMS_TO
 *   BRIEFING_API_URL (default https://animebirthday.vercel.app/api/briefing/monthly)
 */

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

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

function monthStamp(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sentMarkerPath() {
  return resolve(process.cwd(), "data", "briefing-imessage-sent.json");
}

function alreadySentThisMonth() {
  const path = sentMarkerPath();
  if (!existsSync(path)) return false;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data?.month === monthStamp();
  } catch {
    return false;
  }
}

function markSentThisMonth() {
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });
  writeFileSync(
    sentMarkerPath(),
    JSON.stringify(
      { month: monthStamp(), sentAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
  );
}

function sendIMessage(phone, text) {
  const cleaned = text
    .replace(/×/g, "x")
    .replace(/®/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-");

  const tmp = resolve(
    tmpdir(),
    `animebirthday-brief-${randomBytes(6).toString("hex")}.txt`,
  );
  writeFileSync(tmp, cleaned, "utf8");

  const script = `
set msgPath to POSIX file "${tmp}"
set msgText to read msgPath as «class utf8»
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${phone}" of targetService
  send msgText to targetBuddy
end tell
`;
  try {
    const result = spawnSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 60000,
    });
    if (result.status !== 0) {
      throw new Error(
        (result.stderr || result.stdout || "osascript failed").trim(),
      );
    }
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  loadEnvLocal();
  const dryPrint = process.argv.includes("--dry-print");
  const force = process.argv.includes("--force");
  const today = new Date();
  const isFirstOfMonth = today.getDate() === 1;

  if (!dryPrint && !force && !isFirstOfMonth) {
    console.log(
      `skip: only sends on the 1st of the month (today=${today.toDateString()}). Use --force to override, --dry-print to preview.`,
    );
    process.exit(0);
  }

  if (!dryPrint && !force && alreadySentThisMonth()) {
    console.log(
      `skip: already sent for ${monthStamp()} (see data/briefing-imessage-sent.json)`,
    );
    process.exit(0);
  }

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

  if (!force || isFirstOfMonth) {
    markSentThisMonth();
  }
  // --force mid-month: don't mark, so the real 1st still sends
  console.log(
    force && !isFirstOfMonth
      ? "sent with --force (did not mark month; 1st will still send)"
      : `marked sent for ${monthStamp()}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
