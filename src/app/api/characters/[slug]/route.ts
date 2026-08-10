import { NextResponse } from "next/server";
import { getCharacterBySlug } from "@/lib/queries";
import { daysUntilBirthday, nextBirthdayDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const character = await getCharacterBySlug(slug);
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...character,
    daysUntil: daysUntilBirthday(character.birthMonth, character.birthDay),
    nextDate: nextBirthdayDate(
      character.birthMonth,
      character.birthDay,
    ).toISOString(),
  });
}
