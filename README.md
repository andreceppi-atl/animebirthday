# AnimeBirthday

Creator-focused anime character birthday calendar: upcoming birthdays ranked by popularity, show/demo context, JP media moments, and TikTok hashtags + embeds for edits.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Local JSON store (`data/store.json`) by default
- Optional Neon Postgres via `DATABASE_URL` (Drizzle schema included)
- AniList GraphQL ingest + MAL/wiki calendar scrape + moments scrape
- ChartEx UGC stamping for TikTok sound/video volume
- Vercel Cron for scheduled refresh

## Setup

```bash
npm install
cp .env.example .env.local
npm run seed          # AniList top characters with birthdays
# npm run seed:wiki   # also run wiki/MAL coverage fill
# npm run moments     # JP media moments (combat/death/kaiju + releases)
# npm run seed:tiktok # embed seed TikTok edit URLs for top chars
# npm run stamp:ugc   # ChartEx volumes onto upcoming entries
npm run dev
```

For Vercel + Neon:

1. Accept Neon marketplace terms (one-time): `https://vercel.com/atlantic4/~/integrations/accept-terms/neon`
2. `npx vercel integration add neon -n animebirthday-db`
3. `npx vercel env pull .env.local`
4. Set `CRON_SECRET` (already used by `/api/ingest`)
5. `npm run db:push` then `npm run db:sync` once from `data/store.json`

When `DATABASE_URL` is set, ingest loads from Postgres first (so Vercel cron cannot wipe Neon from an empty ephemeral `store.json`).

Open [http://localhost:3000](http://localhost:3000).

### Env

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres (optional; app uses `data/store.json` when unset) |
| `CRON_SECRET` | Bearer token for `/api/ingest` and `/api/briefing/monthly` |
| `CHARTEX_APP_ID` / `CHARTEX_APP_TOKEN` | ChartEx UGC lookup + stamp |
| `CONFIDENT_MIN_FAVOURITES` | Min AniList favourites for public birthdays (default 500) |
| `CONFIDENT_MIN_MOMENT_SIGNIFICANCE` | Min significance for non-AniList moments (default 50) |
| `ANTHROPIC_API_KEY` | Claude for monthly creator briefing |
| `BRIEFING_IMESSAGE_TO` / `BRIEFING_SMS_TO` | E.164 phone for mule iMessage delivery (e.g. `+19147042663`) |
| `WIKI_BIRTHDAY_URL` | Optional HTML wikitable URL for extra birthday coverage |
| `WIKI_MOMENTS_URL` | Optional HTML table for extra moments |

### Cron

`vercel.json` schedules (UTC):

| Schedule | Source | Purpose |
|----------|--------|---------|
| Daily 06:00 | `anilist` | Top characters: favs / photos / birthdays |
| Daily 06:30 | `refresh` | Merge wiki stubs, refresh existing favs/images, enrich stubs |
| Daily 12:00 | `chartex` | Stamp ChartEx UGC on upcoming birthdays + moments |
| Daily 13:00 | `checkup` | Health scan + light repair (dupes, favs drift, stub/UGC gaps) |
| Sunday 07:00 | `wiki` | Coverage fill (Jikan → wiki → AniList deep → seed) |
| Sunday 07:30 | `moments` | JP media moments scrape |
| Sunday 08:00 | `saturate` | Deep saturate next-60-day birthdays |
| Tuesday 10:00 | `factcheck` | Repair wrong character→show links; attach crossover/cameo shows |
| 1st of month 08:00 | `monthly` | Full monthly saturate + moments |
| 1st of month 16:00 UTC | `/api/briefing/monthly` | Claude creator brief (mule iMessages it locally) |

Set `CRON_SECRET` in Vercel; cron requests send `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).

Manual refresh examples:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/ingest?source=anilist&pages=1"
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/ingest?source=refresh&refreshLimit=50&enrichLimit=20"
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/ingest?source=checkup"
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/ingest?source=chartex&limit=20&moments=10"
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/briefing/monthly?dryRun=1"
```

Monthly briefing: Vercel generates the Claude brief; the **mule Mac** delivers it over **iMessage** (same pattern as the sold-out tracker — no Twilio).

```bash
# print only
node scripts/send-briefing-imessage.mjs --dry-print
# send via Messages.app
node scripts/send-briefing-imessage.mjs
# schedule on mule (1st of month 12:10 local)
cp scripts/com.animebirthday.monthly-brief.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.animebirthday.monthly-brief.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.animebirthday.monthly-brief.plist
```
## Scripts

- `npm run seed` — ingest AniList
- `npm run seed:wiki` — AniList + wiki/MAL/Jikan coverage fill
- `npm run moments` — significant moments scrape → store
- `npm run stamp:ugc` — ChartEx batch stamp for UGC sort
- `npm run factcheck:shows` — audit character→show links vs AniList roles (`--repair` fixes BACKGROUND cameos)
- `npm run refresh:catalog` — merge wiki stubs + refresh AniList fields + enrich
- `npm run checkup` — recurring health scan (same as daily Vercel `checkup` cron)
- `npm run seed:tiktok` — oEmbed seed edit URLs from `data/tiktok-seeds.json`
- `npm run saturate` — deep AniList crawl for near-term birthdays
- `npm run db:push` — push Drizzle schema to Neon when `DATABASE_URL` is set
- `npm run db:sync` — push local `data/store.json` into Neon (initial load)

Wiki scrape order: Jikan (MAL, timeout-bounded) → optional `WIKI_BIRTHDAY_URL` → AniList deep pages → committed seed file.

## Pages

- `/` — upcoming 60 days + filters (popularity / relevance / UGC / date) + type (birthday / moment / all)
- `/calendar` — month grid (birthdays + moments)
- `/sports` — month sports × anime overlap plan (Plan / Proximity / Same-day / Premieres) + CSV export
- `/character/[slug]` — demos, hashtag deep links, ChartEx lookup, TikTok oEmbed
- `/moment/[slug]` — JP media moment detail + ChartEx
- `/api/export/upcoming` — collab CSV (type, premiere timing, days-until, angle)
- `/api/export/sports-overlap` — sports overlap CSV with creator ask
- `/api/briefing/monthly` — monthly Claude briefing (auth + optional `dryRun=1`; SMS optional via Twilio)

### ChartEx

Add credentials from [ChartEx API Dashboard](https://chartex.com/apidocs/dashboard):

```bash
CHARTEX_APP_ID=...
CHARTEX_APP_TOKEN=...
```

Then on a character/moment page use **ChartEx check**, or run `npm run stamp:ugc` / Monday cron to stamp volumes for UGC sorting.
