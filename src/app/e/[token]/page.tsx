import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n-server";
import { loadLink } from "@/lib/invoice-link";
import { getSifenMode } from "@/lib/sifen";
import { formatDateTime } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { RedeemForm } from "./redeem-form";

/**
 * The one-time invoice link (PLAN Phase 8.1).
 *
 * The only page in the app reachable without a session — `/e/` is excluded
 * from the middleware matcher on purpose, and the token is what stands in for
 * the login. Everything the page is allowed to do comes off the stored link;
 * nothing is taken from the URL beyond the token itself.
 *
 * Four states, all rendered here rather than redirected to, so the visitor
 * always learns what happened to their link:
 *   - the token matches nothing → "invalid" (indistinguishable from a typo,
 *     which is the point: no oracle for guessing tokens);
 *   - it matched but expired unredeemed → "expired";
 *   - it was redeemed → the resulting document, with its KuDE;
 *   - it is live → the emission form.
 */

// A capability URL must never end up in an index or a shared cache.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function InvoiceLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { t, locale } = await getT();
  const { token } = await params;
  const loaded = await loadLink(token);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">{children}</main>
  );

  if (!loaded) {
    return (
      <Shell>
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>
            <strong className="block">{t("invoiceLink.notFoundTitle")}</strong>
            {t("invoiceLink.notFoundBody")}
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const { link, state } = loaded;
  const company = await prisma.company.findUnique({
    where: { id: link.companyId },
    select: { razonSocial: true },
  });
  const companyName = company?.razonSocial ?? "—";

  if (state === "expired") {
    return (
      <Shell>
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>
            <strong className="block">{t("invoiceLink.expiredTitle")}</strong>
            {t("invoiceLink.expiredBody")}
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  if (state === "redeemed") {
    const invoice = link.invoiceId
      ? await prisma.invoice.findFirst({
          where: { id: link.invoiceId, companyId: link.companyId },
        })
      : null;

    // Redeemed but with no document: the claim was taken and the emission
    // then failed. Say the link is spent rather than pretend it still works.
    if (!invoice) {
      return (
        <Shell>
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              <strong className="block">{t("invoiceLink.usedTitle")}</strong>
              {t("invoiceLink.usedBody")}
            </AlertDescription>
          </Alert>
        </Shell>
      );
    }

    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-5 text-green-600" />
              {t("invoiceLink.successTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("invoiceLink.successBody")}</p>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoiceLink.number")}</dt>
                <dd className="tabular-nums font-medium">{invoice.fullNumber ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoiceLink.cdc")}</dt>
                <dd className="break-all text-right font-mono text-xs">{invoice.cdc ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoiceLink.total")}</dt>
                <dd className="tabular-nums font-medium">
                  {new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PY", {
                    maximumFractionDigits: invoice.moneda === "PYG" ? 0 : 2,
                  }).format(Number(invoice.total))}{" "}
                  {invoice.moneda}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t("invoiceLink.status")}</dt>
                <dd>
                  <StatusBadge status={invoice.status} />
                </dd>
              </div>
            </dl>

            {getSifenMode() === "mock" && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{t("invoiceLink.mockNotice")}</AlertDescription>
              </Alert>
            )}

            {invoice.kudePath && (
              <Button variant="outline" asChild>
                <a href={`/e/${token}/kude`}>
                  <Download /> {t("invoiceLink.downloadKude")}
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 space-y-2">
        <h1 className="text-xl font-semibold">{t("invoiceLink.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("invoiceLink.subtitle", { company: companyName })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("invoiceLink.expiresIn", { date: formatDateTime(link.expiresAt, locale) })}
        </p>
      </div>

      {getSifenMode() === "mock" && (
        <Alert variant="warning" className="mb-6">
          <Info />
          <AlertDescription>{t("invoiceLink.mockNotice")}</AlertDescription>
        </Alert>
      )}

      <RedeemForm
        token={token}
        moneda={link.moneda}
        numberLocale={locale === "en" ? "en-US" : "es-PY"}
      />
    </Shell>
  );
}
