import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { headers } from "next/headers";
import { getLocale, getT } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/i18n-provider";
import { siteForHost } from "@/lib/hosts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: {
      default: t("app.name"),
      template: `%s · ${t("app.name")}`,
    },
    description: t("login.metaDescription"),
    robots: { index: false, follow: false },
    openGraph: {
      title: t("app.name"),
      description: t("login.metaDescription"),
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The marketing host is Spanish-first and has no language switch, so it
  // must not inherit an `en` cookie left over from the application — a page
  // that declares the wrong language is a page search engines mis-serve. It
  // also needs no i18n context: its copy lives in `src/lib/marketing`.
  const marketing = siteForHost((await headers()).get("host")) === "marketing";
  if (marketing) {
    return (
      <html lang="es-PY">
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    );
  }

  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
