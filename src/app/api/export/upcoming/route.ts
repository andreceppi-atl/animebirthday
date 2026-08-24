import { NextResponse } from "next/server";
import {
  getUpcomingCharacters,
  type SortMode,
  type TypeFilter,
} from "@/lib/queries";
import { buildExportRows, rowsToCsv } from "@/lib/export/upcomingCsv";
import { hasDatabaseUrl } from "@/lib/db";
import {
  pgGetAllCharactersWithRelations,
} from "@/lib/db/postgres";
import { readStore } from "@/lib/db/store";
import type { CharacterWithShow, ShowRecord } from "@/lib/types";
import type { MomentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadCharacterMap(): Promise<Map<number, CharacterWithShow>> {
  if (hasDatabaseUrl()) {
    const chars = await pgGetAllCharactersWithRelations();
    return new Map(chars.map((c) => [c.id, c]));
  }
  const store = await readStore();
  const showMap = new Map(store.shows.map((s) => [s.id, s]));
  const map = new Map<number, CharacterWithShow>();
  for (const c of store.characters) {
    map.set(c.id, {
      ...c,
      alsoShowIds: c.alsoShowIds ?? [],
      show: c.showId ? showMap.get(c.showId) ?? null : null,
      alsoShows: (c.alsoShowIds ?? [])
        .map((id) => showMap.get(id))
        .filter((s): s is ShowRecord => Boolean(s)),
      hashtags: store.hashtags.filter((h) => h.characterId === c.id),
      tiktokVideos: store.tiktokVideos.filter((v) => v.characterId === c.id),
    });
  }
  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? "60");
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 1000);
  const q = searchParams.get("q") ?? undefined;
  const sort = (searchParams.get("sort") as SortMode | null) ?? "date";
  const type = (searchParams.get("type") as TypeFilter | null) ?? "birthday";
  const demo = searchParams.get("demo") ?? undefined;
  const momentKind =
    (searchParams.get("momentKind") as MomentKind | null) ?? undefined;

  const [upcoming, characterMap] = await Promise.all([
    getUpcomingCharacters({
      days,
      limit,
      q,
      sort,
      type,
      demo,
      momentKind: momentKind || "",
    }),
    loadCharacterMap(),
  ]);

  const rows = buildExportRows(upcoming, characterMap);
  const csv = rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `animebirthday-export-${stamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
