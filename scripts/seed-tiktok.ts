import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { addCharacterTikTokVideo, getCharacterBySlug } from "../src/lib/queries";

type Seed = { slug: string; videoUrl: string };

async function main() {
  const seedPath = path.join(process.cwd(), "data", "tiktok-seeds.json");
  const raw = await fs.readFile(seedPath, "utf8");
  const seeds = JSON.parse(raw) as Seed[];

  for (const seed of seeds) {
    const character = await getCharacterBySlug(seed.slug);
    if (!character) {
      console.warn(`Skip ${seed.slug}: character not found (run npm run seed first)`);
      continue;
    }
    try {
      const video = await addCharacterTikTokVideo(seed.slug, seed.videoUrl);
      console.log(`Embedded ${seed.slug}:`, video.title ?? video.videoUrl);
    } catch (err) {
      console.warn(
        `Failed ${seed.slug}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
