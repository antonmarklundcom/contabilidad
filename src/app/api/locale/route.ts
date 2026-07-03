import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

/** Sets the UI language: cookie + user profile. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const locale = normalizeLocale(body?.locale);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    await prisma.user
      .update({ where: { id: session.user.id }, data: { locale } })
      .catch(() => undefined);
  }
  return NextResponse.json({ ok: true, locale });
}
