# Creator Ops (Confidence + Sports Month + CSV + Monthly Grok SMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship confident-only public dates, collab-ready CSV + sports month plan UX, and a monthly Grok SMS briefing for anime/TikTok/ad plays — without regressing anime calendar sort filters.

**Architecture:** Shared `isConfident*` helpers gate all public queries. Sports page becomes a month-horizon plan with optional lane tabs + CSV. A new cron route builds a structured month digest, calls xAI Grok, and sends Twilio SMS. Secrets stay in Vercel env.

**Tech Stack:** Next.js App Router, existing `getUpcomingCharacters` / sports overlap libs, xAI Chat Completions (`https://api.x.ai/v1`), Twilio REST SMS, Vercel Cron + `CRON_SECRET`.

## Global Constraints

- Do **not** remove or hardcode away anime calendar sort chips: Relevance / Popularity / UGC / Date (see `.cursor/rules/anime-calendar-sort-filters.mdc`). Relevance = soonest then favourites within day.
- Do **not** invent non-canonical birthdays.
- Do **not** commit phone numbers, Twilio tokens, or xAI keys. Use env vars only.
- Phone for SMS: set `BRIEFING_SMS_TO=+19147042663` in Vercel (never hardcode in source).
- Leave untracked: `.agents/`, local debug logs; do commit `.cursor/rules/` when relevant.
- Deploy target: `npx vercel deploy --prod --yes --scope atlantic4` → https://animebirthday.vercel.app
- Branch: `cursor/anime-birthday-calendar`
- Prefer small commits per task; push + deploy only when user/delegate runbook says so.

---

## Delegation runbook (how to automate this)

### Parallel tracks (after Task 1 lands)

| Track | Tasks | Can run parallel? | Agent prompt starter |
|-------|-------|-------------------|----------------------|
| A Confidence | 1 | Blocks everything | “Implement Task 1 only from `docs/superpowers/plans/2026-08-24-creator-ops.md`” |
| B CSV | 2 | After Task 1 | “Implement Task 2 only…” |
| C Sports UX | 3–4 | After Task 1; 3 then 4 | “Implement Task 3 only…” then Task 4 |
| D Briefing SMS | 5–7 | After Task 1; sequential 5→6→7 | “Implement Task 5 only…” |

### Fast debug loop

1. `npx tsc --noEmit`
2. `npm run dev` → hit routes listed in each task
3. For cron/SMS: `curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/briefing/monthly?dryRun=1"`
4. Prod smoke: `/`, `/sports`, `/api/export/upcoming`, `/api/export/sports-overlap`, `/api/briefing/monthly?dryRun=1`
5. If SMS fails: check Twilio trial → US number verified; check `BRIEFING_SMS_TO` E.164

### Env to add in Vercel (atlantic4 / animebirthday)

```
XAI_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
BRIEFING_SMS_TO=+19147042663
CONFIDENT_MIN_FAVOURITES=500
CONFIDENT_MIN_MOMENT_SIGNIFICANCE=50
```

Keep existing: `CRON_SECRET`, `DATABASE_URL`, `CHARTEX_*`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/confidence.ts` | Pure `isConfidentCharacter` / `isConfidentMoment` / filter helpers |
| `src/lib/queries.ts` | Apply confidence gate in upcoming + calendar loaders |
| `src/lib/export/upcomingCsv.ts` | Extra CSV columns |
| `src/app/api/export/upcoming/route.ts` | Pass-through (may need no change) |
| `src/lib/export/sportsOverlapCsv.ts` | Sports overlap CSV builder |
| `src/app/api/export/sports-overlap/route.ts` | Sports CSV endpoint |
| `src/app/sports/page.tsx` | Month plan + tabs + creator ask |
| `src/lib/sports/overlap.ts` | Month default days=31; expose lane helpers if needed |
| `src/lib/briefing/monthDigest.ts` | Structured digest JSON for the month |
| `src/lib/briefing/grokBrief.ts` | xAI Grok call + persona prompt |
| `src/lib/briefing/sms.ts` | Twilio send |
| `src/app/api/briefing/monthly/route.ts` | Cron + dryRun endpoint |
| `vercel.json` | Add monthly briefing cron |
| `.env.example` | Document new env keys |
| `.cursor/rules/anime-calendar-sort-filters.mdc` | Untouched except if confidence note needed |

---

### Task 1: Confidence gate (blocks other tracks)

**Files:**
- Create: `src/lib/confidence.ts`
- Modify: `src/lib/queries.ts` (`getUpcomingCharacters`, `getCalendarMonth`, character/moment loaders used by public UI)
- Modify: `src/lib/sports/overlap.ts` (filter anime side after fetch **or** rely on queries gate when `type=all`)
- Test: `scripts/check-confidence.ts` (one-off node script) OR inline `npx tsx` assertions

**Interfaces:**
- Produces:
  - `isConfidentCharacter(c: { source: string; anilistId: number \| null; favourites: number; birthMonth: number; birthDay: number }): boolean`
  - `isConfidentMoment(m: { source: string; significance: number; year: number \| null; kind: string }): boolean`
  - Env: `CONFIDENT_MIN_FAVOURITES` (default 500), `CONFIDENT_MIN_MOMENT_SIGNIFICANCE` (default 50)

- [ ] **Step 1: Add `src/lib/confidence.ts`**

```ts
import { normalizeMomentKind } from "@/lib/utils";

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function confidentMinFavourites(): number {
  return envInt("CONFIDENT_MIN_FAVOURITES", 500);
}

export function confidentMinMomentSignificance(): number {
  return envInt("CONFIDENT_MIN_MOMENT_SIGNIFICANCE", 50);
}

export function isConfidentCharacter(c: {
  source: string;
  anilistId: number | null;
  favourites: number;
  birthMonth: number;
  birthDay: number;
}): boolean {
  if (c.source !== "anilist") return false;
  if (c.anilistId == null) return false;
  if (!c.birthMonth || !c.birthDay) return false;
  if (c.favourites < confidentMinFavourites()) return false;
  return true;
}

export function isConfidentMoment(m: {
  source: string;
  significance: number;
  year: number | null;
  kind: string;
}): boolean {
  const kind = normalizeMomentKind(m.kind);
  if (m.significance < confidentMinMomentSignificance() && m.source !== "anilist") {
    return false;
  }
  // Actual-premiere claims need a year; anniversary may omit but prefer year when present
  if (kind === "release_anniversary" && m.source === "anilist" && m.year == null) {
    return false;
  }
  return true;
}
```

- [ ] **Step 2: Gate `getUpcomingCharacters` after mapping to feed items**

In `src/lib/queries.ts`, after building `items` from characters/moments and **before** q/demo filters, filter:

```ts
import { isConfidentCharacter, isConfidentMoment } from "@/lib/confidence";

// When mapping: only include characters/moments that pass confidence.
// Prefer filtering at load:
const characters = (await loadCharacters()).filter(isConfidentCharacter);
const moments = (await loadMoments()).filter(isConfidentMoment);
```

Apply the same filters inside `getCalendarMonth` before bucketing by day.

- [ ] **Step 3: Verify sports overlap uses gated upcoming**

`getSportsAnimeOverlaps` already calls `getUpcomingCharacters({ type: "all" })` — confirm it inherits the gate. If it loads moments separately later, gate there too.

- [ ] **Step 4: Smoke test**

Run:

```bash
npx tsc --noEmit
npm run dev
# curl "http://localhost:3000/api/upcoming?type=birthday&limit=5" | jq '.upcoming | length'
```

Expected: only AniList-linked characters with favs ≥ 500; no wiki-only stubs.

- [ ] **Step 5: Commit**

```bash
git add src/lib/confidence.ts src/lib/queries.ts src/lib/sports/overlap.ts
git commit -m "Only surface confident AniList birthdays and moments in public feeds."
```

---

### Task 2: Enrich upcoming CSV for collab

**Files:**
- Modify: `src/lib/export/upcomingCsv.ts`
- Modify: `src/app/api/export/upcoming/route.ts` (only if headers need wiring)
- Depends on: Task 1 (export should only include confident rows via queries)

**Interfaces:**
- Consumes: `UpcomingItem` (`feedKind`, `momentKind`, `year`, `nextDate`, `daysUntil`, …)
- Produces: CSV columns:
  - Order, Name, Anime of origin, Character description, UGC / hashtag link, Hashtag, Date, Favourites
  - **Type** (`Anime - Birthday` / `Anime - Premiere` / … via `animeCalendarTypeLabel`)
  - **Premiere timing** (`Actual premiere` / `Premiere anniversary` / empty)
  - **Days until**
  - **Suggested angle** (short template string, not LLM)

- [ ] **Step 1: Extend `ExportRow` and header**

```ts
export type ExportRow = {
  order: number;
  name: string;
  anime: string;
  description: string;
  ugcLink: string;
  hashtag: string;
  date: string;
  favourites: number;
  type: string;
  premiereTiming: string;
  daysUntil: number;
  suggestedAngle: string;
};
```

Suggested angle templates:

```ts
function suggestedAngle(item: UpcomingItem): string {
  if (item.feedKind === "birthday") {
    return `Birthday UGC day-of / ±1d · lean into ${item.show?.titleEnglish || item.show?.titleRomaji || "franchise"} nostalgia + trend sound`;
  }
  const timing = premiereTimingBadge({
    momentKind: item.momentKind,
    year: item.year,
    nextDate: item.nextDate,
  });
  if (timing?.startsWith("Actual")) {
    return `First-airing / premiere window · announce + react edits, not anniversary framing`;
  }
  if (timing) {
    return `Premiere anniversary · throwback edits, not “new episode” language`;
  }
  return `Moment play · tie franchise + date into short-form hook`;
}
```

- [ ] **Step 2: Update `rowsToCsv` header order**

Append: `Type,Premiere timing,Days until,Suggested angle`

- [ ] **Step 3: Manual test**

```bash
curl -o /tmp/up.csv "http://localhost:3000/api/export/upcoming?type=birthday&sort=relevance&days=30"
head -2 /tmp/up.csv
```

Expected: new columns present; Type starts with `Anime -`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/upcomingCsv.ts
git commit -m "Enrich upcoming CSV with type, premiere timing, days-until, and angle stubs."
```

---

### Task 3: Sports month plan + creator ask + lane tabs

**Files:**
- Modify: `src/app/sports/page.tsx`
- Modify: `src/lib/sports/overlap.ts` (default `days` → 31)
- Modify: `src/lib/utils.ts` only if adding `sportsCreatorAsk(...)` helper — prefer `src/lib/sports/brief.ts`

**Interfaces:**
- Produces: `sportsCreatorAsk(event, item, opts): string`
- URL: `/sports?view=plan|proximity|sameday|premieres&sport=&days=` — **default `view=plan`, default `days=31`**

- [ ] **Step 1: Add `src/lib/sports/brief.ts`**

```ts
import { animeCalendarTypeLabel, isActualPremiere, premiereTimingBadge } from "@/lib/utils";
import { sportsEventLabel } from "@/lib/sports/load";
import type { SportsAnimeOverlap } from "@/lib/sports/types";

export function sportsCreatorAsk(overlap: SportsAnimeOverlap): string {
  const { sportsEvent: e, animeItem: a, hasProximity } = overlap;
  const anime = animeCalendarTypeLabel(a.feedKind, a.momentKind, {
    year: a.year,
    nextDate: a.nextDate,
  });
  const window =
    e.daysUntil === 0 ? "post day-of" : e.daysUntil === 1 ? "post tomorrow / day-of" : `plan now · post in ${e.daysUntil}d (±1)`;
  const fit = hasProximity ? "proximity fit" : "same-day timing only";
  return `${sportsEventLabel(e)} × ${anime} · ${window} · ${fit}`;
}

export type SportsView = "plan" | "proximity" | "sameday" | "premieres";

export function filterOverlapsForView(
  overlaps: SportsAnimeOverlap[],
  view: SportsView,
): SportsAnimeOverlap[] {
  if (view === "plan") return overlaps;
  if (view === "proximity") return overlaps.filter((o) => o.hasProximity);
  if (view === "sameday") return overlaps.filter((o) => !o.hasProximity);
  return overlaps.filter((o) =>
    isActualPremiere({
      momentKind: o.animeItem.momentKind,
      year: o.animeItem.year,
      nextDate: o.animeItem.nextDate,
    }) || Boolean(premiereTimingBadge({
      momentKind: o.animeItem.momentKind,
      year: o.animeItem.year,
      nextDate: o.animeItem.nextDate,
    })),
  );
}
```

For `premieres` view: keep only release/premiere-related anime items (badge non-null).

- [ ] **Step 2: Default sports fetch to 31 days; parse `view`**

In `src/app/sports/page.tsx`:

```ts
const days = Number(params.days ?? "31") || 31;
const view = (params.view as SportsView) || "plan";
```

Render tab links: Plan / Proximity / Same-day / Premieres preserving `sport` + `days`.

- [ ] **Step 3: Put creator ask as first line of each `OverlapRow`**

Above existing badges:

```tsx
<p className="text-sm text-[var(--ink)]">{sportsCreatorAsk(overlap)}</p>
```

- [ ] **Step 4: Hero copy**

Title stays **Sports calendar**. Subcopy: month campaign plan horizon; tabs for lane focus.

- [ ] **Step 5: Smoke**

Open `/sports`, `/sports?view=proximity`, `/sports?view=premieres`. Confirm default ~month window.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sports/brief.ts src/lib/sports/index.ts src/app/sports/page.tsx src/lib/sports/overlap.ts
git commit -m "Add sports month plan view, lane tabs, and creator ask lines."
```

---

### Task 4: Sports overlap CSV export

**Files:**
- Create: `src/lib/export/sportsOverlapCsv.ts`
- Create: `src/app/api/export/sports-overlap/route.ts`
- Modify: `src/app/sports/page.tsx` (Export CSV button)

**Interfaces:**
- `GET /api/export/sports-overlap?days=31&sport=mlb&view=plan`
- Columns: Order, Creator ask, Sports label, Sports title, Anime type, Premiere timing, Anime name, Franchise/show, Date, Days until, Proximity, Proximity hints, Overlap score

- [ ] **Step 1: Implement CSV builder + route** (mirror `src/app/api/export/upcoming/route.ts` auth-free public export pattern)

- [ ] **Step 2: Button on sports page** next to filters — uses current `days`, `sport`, `view`

- [ ] **Step 3: Test**

```bash
curl -o /tmp/sp.csv "http://localhost:3000/api/export/sports-overlap?days=31&view=proximity"
head -2 /tmp/sp.csv
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/sportsOverlapCsv.ts src/app/api/export/sports-overlap/route.ts src/app/sports/page.tsx
git commit -m "Add sports overlap CSV export for campaign collab."
```

---

### Task 5: Month digest builder (no AI / no SMS yet)

**Files:**
- Create: `src/lib/briefing/monthDigest.ts`
- Create: `scripts/print-month-digest.ts` (optional debug)

**Interfaces:**
- Produces:

```ts
export type MonthDigest = {
  monthLabel: string; // "September 2026"
  year: number;
  month: number; // 1-12
  birthdays: Array<{
    name: string;
    date: string;
    daysUntil: number;
    favourites: number;
    show: string;
    demos: string[];
  }>;
  moments: Array<{
    title: string;
    date: string;
    daysUntil: number;
    type: string;
    premiereTiming: string;
    franchise: string;
  }>;
  sportsPlays: Array<{
    creatorAsk: string;
    hasProximity: boolean;
  }>;
  generatedAt: string;
};

export async function buildMonthDigest(from?: Date): Promise<MonthDigest>;
```

Logic:
- Window = remainder of current calendar month if `from` day > 1; on the 1st, full month ahead through month-end (and include early next-month spill only if daysUntil within month — keep simple: **from `from` through last day of that month**).
- Use confident gated `getUpcomingCharacters` + `getSportsAnimeOverlaps({ days: daysLeftInMonth })`.
- Cap lists: top 25 birthdays by relevance sort, top 15 moments, top 15 sports proximity-first.

- [ ] **Step 1: Implement `buildMonthDigest`**
- [ ] **Step 2: Dry print**

```bash
npx tsx -e "import { buildMonthDigest } from './src/lib/briefing/monthDigest.ts'; console.log(JSON.stringify(await buildMonthDigest(), null, 2))"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/briefing/monthDigest.ts
git commit -m "Add structured month digest for birthdays, moments, and sports plays."
```

---

### Task 6: Grok brief writer (xAI)

**Files:**
- Create: `src/lib/briefing/grokBrief.ts`

**Interfaces:**
- `writeMonthlyBrief(digest: MonthDigest): Promise<string>` → SMS-sized text (≤1500 chars preferred; hard cap 1500 for Twilio body safety; if longer, truncate with “…” and store full text in API JSON only)

Persona system prompt (lock this copy):

```ts
const SYSTEM = `You are Grok embedded in AnimeBirthday ops: a specialist in anime fandom, advertising creative, and TikTok/short-form trends.
Write a punchy monthly creator briefing for a music/entertainment brand team.
Rules:
- Only use facts present in the JSON digest. Do not invent birthdays, premieres, or sports outcomes.
- Clearly separate Actual Premiere vs Premiere Anniversary when present.
- Prefer actionable plays: hook angle, posting window, why it trends.
- Tone: sharp, commercial, no cringe, no purple prose.
- Output plain text SMS-friendly paragraphs. No markdown tables. Max ~1400 characters.`;
```

User message: `JSON.stringify(digest)`.

Call:

```ts
const res = await fetch("https://api.x.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "grok-4", // if 404, fall back to "grok-3" or "grok-2-latest" — try in dryRun
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(digest) },
    ],
  }),
});
```

If `XAI_API_KEY` missing: throw clear error for API route to return 503.

- [ ] **Step 1: Implement + unit-less dry call locally with key**
- [ ] **Step 2: Commit**

```bash
git add src/lib/briefing/grokBrief.ts
git commit -m "Add Grok monthly briefing writer for anime/TikTok/ad plays."
```

---

### Task 7: Twilio SMS + cron route

**Files:**
- Create: `src/lib/briefing/sms.ts`
- Create: `src/app/api/briefing/monthly/route.ts`
- Modify: `vercel.json` (add cron)
- Modify: `.env.example`
- Modify: `README.md` (env table + cron row)

**Interfaces:**
- `sendSms(body: string): Promise<{ sid: string }>`
- `GET/POST /api/briefing/monthly` — requires `CRON_SECRET` (same pattern as `src/app/api/ingest/route.ts`)
- Query: `dryRun=1` → `{ ok, digest, brief, smsSkipped: true }` no Twilio
- Success SMS: `{ ok, sid, briefChars }`

Twilio:

```ts
const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
// Basic auth sid:token, form: From, To, Body
```

`vercel.json` cron entry:

```json
{
  "path": "/api/briefing/monthly",
  "schedule": "0 16 1 * *"
}
```

(1st of month 16:00 UTC ≈ noon ET.)

- [ ] **Step 1: Implement sms + route with auth**
- [ ] **Step 2: Local dryRun**

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/briefing/monthly?dryRun=1" | jq '{ok, briefChars: (.brief|length), smsSkipped}'
```

- [ ] **Step 3: Optional real SMS once keys set** (`dryRun=0`) — confirm phone receives text
- [ ] **Step 4: Commit + document env**

```bash
git add src/lib/briefing/sms.ts src/app/api/briefing/monthly/route.ts vercel.json .env.example README.md
git commit -m "Add monthly Grok SMS briefing cron via Twilio."
```

- [ ] **Step 5: Set Vercel env + deploy**

```bash
# set envs in dashboard or vercel env add
npx vercel deploy --prod --yes --scope atlantic4
```

---

### Task 8: End-to-end acceptance (single agent)

- [ ] **Step 1: Checklist**

| Check | Pass criteria |
|-------|----------------|
| `/` birthdays | No wiki-only / low-fav noise |
| Sort chips | Relevance / Popularity / UGC / Date still present |
| Upcoming CSV | New collab columns |
| `/sports` | Defaults to month plan; tabs work |
| Sports CSV | Downloads with creator ask |
| Briefing dryRun | Returns brief text, authenticated |
| Prod | https://animebirthday.vercel.app healthy |

- [ ] **Step 2: Push/deploy if not done**
- [ ] **Step 3: Final commit only if fixes needed**

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Confident-only public dates | 1 |
| CSV enrichment | 2 |
| Sports creator ask | 3 |
| Sports optional lane tabs | 3 |
| Sports month plan default | 3 |
| Sports CSV + collab fields | 4 |
| Monthly AI digest | 5–6 |
| SMS to cell | 7 |
| Creator brief UI later | Explicitly omitted |
| Saved views skip | Explicitly omitted |

## Placeholder scan

None intentional — model id `grok-4` may need fallback at implement time (`grok-3` / `grok-2-latest`); Task 6 documents that.

## Type consistency

- `SportsView`, `MonthDigest`, `sportsCreatorAsk`, confidence helpers named as above across tasks.
- `BRIEFING_SMS_TO` E.164; never `9147042663` without `+1` in code samples for Twilio.
