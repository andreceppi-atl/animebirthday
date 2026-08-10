# AnimeBirthday

Creator-focused anime character birthday calendar: upcoming birthdays ranked by popularity, show/demo context, and TikTok hashtags + embeds for edits.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Local JSON store (`data/store.json`) by default
- Optional Neon Postgres via `DATABASE_URL` (Drizzle schema included)
- AniList GraphQL ingest + MAL/wiki calendar scrape
- Vercel Cron for daily refresh

## Setup

```bash
npm install
cp .env.example .env.local
npm run seed          # AniList top characters with birthdays
# npm run seed:wiki   # also run wiki/MAL coverage fill
# npm run seed:tiktok # embed seed TikTok edit URLs for top chars
npm run dev
```

For Vercel + Neon: set `DATABASE_URL` and `CRON_SECRET`, run `npm run db:push`, then `npm run seed && npm run db:sync` (or ingest via cron, which syncs automatically when `DATABASE_URL` is set).

Open [http://localhost:3000](http://localhost:3000).

### Env

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres (optional; app uses `data/store.json` when unset) |
| `CRON_SECRET` | Bearer token for `/api/ingest` |
| `WIKI_BIRTHDAY_URL` | Optional HTML wikitable URL for extra birthday coverage |

### Cron

`vercel.json` schedules:

- Daily 06:00 UTC — AniList refresh
- Weekly Sunday 07:00 UTC — wiki/MAL scrape

Set `CRON_SECRET` in Vercel; cron requests send `Authorization: Bearer <CRON_SECRET>`.

## Scripts

- `npm run seed` — ingest AniList
- `npm run seed:wiki` — AniList + wiki/MAL/Jikan coverage fill (falls back to AniList deep pages + `data/wiki-seed.json`)
- `npm run seed:tiktok` — oEmbed seed edit URLs from `data/tiktok-seeds.json`
- `npm run db:push` — push Drizzle schema to Neon when `DATABASE_URL` is set
- `npm run db:sync` — push local `data/store.json` into Neon

Wiki scrape order: Jikan (MAL) → optional `WIKI_BIRTHDAY_URL` HTML table → AniList deep pages → committed seed file.

## Pages

- `/` — upcoming 60 days + filters (popularity / relevance / UGC) + biggest this week
- `/calendar` — month grid
- `/character/[slug]` — demos, hashtag deep links, ChartEx lookup, TikTok oEmbed

### ChartEx

Add credentials from [ChartEx API Dashboard](https://chartex.com/apidocs/dashboard):

```bash
CHARTEX_APP_ID=...
CHARTEX_APP_TOKEN=...
```

Then on a character page, use **ChartEx check** to look up anime TikTok sound volume and optionally stamp it for UGC sorting.