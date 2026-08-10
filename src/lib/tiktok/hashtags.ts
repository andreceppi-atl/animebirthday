import { hashtagSlug } from "@/lib/utils";

export type GeneratedHashtag = {
  tag: string;
  kind: "name" | "birthday" | "edit" | "show" | "show_edit";
};

export function generateHashtags(input: {
  nameFull: string;
  nameFirst?: string | null;
  showTitle?: string | null;
}): GeneratedHashtag[] {
  const tags: GeneratedHashtag[] = [];
  const seen = new Set<string>();

  const push = (raw: string, kind: GeneratedHashtag["kind"]) => {
    const tag = hashtagSlug(raw);
    if (!tag || tag.length < 2 || seen.has(tag)) return;
    seen.add(tag);
    tags.push({ tag, kind });
  };

  const base =
    hashtagSlug(input.nameFull) ||
    hashtagSlug(input.nameFirst ?? "") ||
    "character";

  push(base, "name");
  push(`${base}birthday`, "birthday");
  push(`${base}edit`, "edit");
  push(`${base}birthdayedit`, "edit");

  if (input.nameFirst) {
    const first = hashtagSlug(input.nameFirst);
    if (first && first !== base) {
      push(first, "name");
      push(`${first}edit`, "edit");
    }
  }

  if (input.showTitle) {
    const show = hashtagSlug(input.showTitle);
    if (show) {
      push(show, "show");
      push(`${show}edit`, "show_edit");
    }
  }

  return tags;
}

export function tiktokTagUrl(tag: string): string {
  return `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
}
