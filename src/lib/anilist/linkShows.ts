import {
  mediaWithRoles,
  pickCrossoverMedia,
  pickPrimaryMedia,
  type AniListCharacter,
  type AniListMediaWithRole,
} from "@/lib/anilist/client";
import { upsertShow } from "@/lib/db/store";
import { extractDemos } from "@/lib/utils";
import type { StoreData } from "@/lib/types";

async function upsertMediaAsShow(
  store: StoreData,
  media: AniListMediaWithRole,
) {
  const tagNames = (media.tags ?? []).map((t) => t.name);
  const demos = extractDemos(media.genres ?? [], tagNames);
  return upsertShow(store, {
    anilistId: media.id,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    titleNative: media.title.native,
    coverImage: media.coverImage.large ?? media.coverImage.medium,
    genres: media.genres ?? [],
    demos,
    popularity: media.popularity ?? 0,
    favourites: media.favourites ?? 0,
    siteUrl: media.siteUrl,
  });
}

/**
 * Resolve primary show + crossover/cameo shows for an AniList character.
 * Primary is the home series; alsoShowIds are distinct franchise appearances
 * (e.g. Saiki K. + Assassination Classroom cameo).
 */
export async function linkShowsForAniListCharacter(
  store: StoreData,
  character: AniListCharacter,
): Promise<{
  showId: number | null;
  alsoShowIds: number[];
  primary: AniListMediaWithRole | null;
  crossovers: AniListMediaWithRole[];
}> {
  const media = mediaWithRoles(character);
  const primary = pickPrimaryMedia(media, character.name.full);
  const crossovers = pickCrossoverMedia(media, primary);

  let showId: number | null = null;
  if (primary) {
    const show = await upsertMediaAsShow(store, primary);
    showId = show.id;
  }

  const alsoShowIds: number[] = [];
  for (const c of crossovers) {
    const show = await upsertMediaAsShow(store, c);
    if (show.id !== showId) alsoShowIds.push(show.id);
  }

  return { showId, alsoShowIds, primary, crossovers };
}
