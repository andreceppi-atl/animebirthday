# AnimeBirthday Creator Ops — Design Spec

**Date:** 2026-08-24  
**Status:** Approved for planning (product decisions locked by user)

## Product decisions (locked)

| Area | Decision |
|------|----------|
| Creator brief UI | Later — out of scope |
| Catalog confidence | Only surface dates we are confident about — no risky/uncertain rows in public feeds |
| Saved views / share presets | Skip |
| CSV export enrichment | Yes — type labels, premiere vs anniversary, days-until, angle stub |
| Sports creator ask line | Yes — one-line “post window” on each overlap |
| Sports lanes | Optional view/tab: Proximity / Same-day / Premiere timing |
| Sports collab + CSV | Yes — export overlaps with labels + proximity reason |
| Sports plan horizon | Always **month** (campaign lead time) |
| Monthly AI briefing | Top of every month: birthdays + plays digest, SMS to ops phone |
| AI persona | Anime + advertising + TikTok trends specialist (Grok / xAI) |

## Confidence gate (definition of “no risks”)

A public feed item is **confident** only if:

**Birthdays**
- `source === "anilist"`
- `anilistId != null`
- Valid `birthMonth` + `birthDay` (already required)
- `favourites >= 500` (tunable via `CONFIDENT_MIN_FAVOURITES`, default 500)

**Moments**
- Kind normalized; for release/premiere kinds, `year != null` when claiming actual premiere
- `significance >= 50` **or** `source === "anilist"`
- Exclude empty wiki stubs / untitled noise

Non-confident rows remain in Neon for ops/debug but are filtered from `/`, `/api/upcoming`, calendar month cells, sports overlap anime side, and CSV export.

## Monthly SMS briefing

- Cron: `0 12 1 * *` America/New_York-equivalent via existing Vercel UTC cron (`0 16 1 * *` ≈ noon ET with DST caveat — document offset; prefer “1st of month 16:00 UTC”)
- Pipeline: load confident month priority + upcoming 30d → prompt Grok (xAI) → SMS via Twilio
- Phone: **env only** `BRIEFING_SMS_TO` (never commit). User target: `+19147042663`
- Auth: same `CRON_SECRET` as `/api/ingest`
- Manual dry-run: `GET /api/briefing/monthly?dryRun=1` returns JSON text, no SMS

## Sports UX

- Default sports page = **Month plan** (next ~30–31 days of overlaps + sports heat)
- Optional tabs: `Plan` | `Proximity` | `Same-day` | `Premieres`
- Each overlap row starts with creator ask line
- `/api/export/sports-overlap` CSV

## Out of scope

- In-app creator brief cards
- Saved named presets
- Extra leagues beyond current seed
- Changing Relevance sort semantics (already: soonest → popularity within day)
