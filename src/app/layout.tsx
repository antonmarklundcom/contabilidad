import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { getLocale, getT } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/i18n-provider";

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
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
