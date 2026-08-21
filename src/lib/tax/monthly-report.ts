/**
 * Assembling and delivering the monthly close report (PLAN Phase 5.7).
 *
 * `tax-report.ts` renders the PDF and knows nothing about the database; the
 * `/api/export/tax-report` route used to do the assembly inline, which meant a
 * job could not produce the same document. That assembly now lives here, so
 * the download and the emailed copy are byte-for-byte the same report.
 */
import { prisma } from "@/lib/prisma";
import type { Company } from "@prisma/client";
import { buildForm120 } from "@/lib/form120";
import { libroVentas, libroCompras } from "@/lib/accounting";
import { computeDeducible } from "@/lib/deductibility";
import {
  generateMonthlyReportPdf,
  type CategoryBreakdownRow,
  type MonthlyReportInput,
} from "@/lib/tax-report";
import { getSifenMode } from "@/lib/sifen";
import { saveFile } from "@/lib/storage";
import { smtpConfigured, sendInvoiceEmail } from "@/lib/mailer";
import { reminderRecipients } from "@/lib/notifications";
import { getDict, normalizeLocale, translate, type Locale } from "@/lib/i18n";

/** Everything the monthly report PDF needs, read from the database. */
export async function buildMonthlyReportInput(
  companyId: string,
  year: number,
  month: number
): Promise<{ company: Company; input: MonthlyReportInput }> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const [company, form120, ventas, compras, expenses, pendingReviewCount] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    buildForm120(companyId, year, month),
    libroVentas(companyId, year, month),
    libroCompras(companyId, year, month),
    prisma.expense.findMany({
      where: { companyId, status: "CONFIRMED", fecha: { gte: start, lte: end } },
      include: { category: true, items: true },
    }),
    prisma.expense.count({ where: { companyId, status: "NEEDS_REVIEW" } }),
  ]);

  const byCategory = new Map<string, CategoryBreakdownRow>();
  for (const e of expenses) {
    const name = e.category?.nameEs ?? "Sin categoría";
    const row = byCategory.get(name) ?? { name, total: 0, ivaDeducible: 0, count: 0 };
    const deducible = computeDeducible({
      iva10: Number(e.iva10),
      iva5: Number(e.iva5),
      deduciblePercent: e.deduciblePercent,
      moneda: e.moneda,
      items: e.items.map((item) => ({
        total: Number(item.total),
        tasa: item.tasa,
        deduciblePercent: item.deduciblePercent,
      })),
    });
    row.total += Number(e.total);
    row.ivaDeducible += deducible.ivaDeducible;
    row.count += 1;
    byCategory.set(name, row);
  }
  const categories = [...byCategory.values()].sort((a, b) => b.total - a.total);

  return {
    company,
    input: {
      form120,
      ventasTotals: ventas.totals,
      comprasTotals: compras.totals,
      categories,
      pendingReviewCount,
    },
  };
}

/** The monthly report PDF for a period. */
export async function renderMonthlyReportPdf(
  companyId: string,
  year: number,
  month: number
): Promise<Buffer> {
  const { company, input } = await buildMonthlyReportInput(companyId, year, month);
  return generateMonthlyReportPdf(company, input, getSifenMode());
}

export function monthlyReportFilename(companyId: string, year: number, month: number): string {
  // companyId keeps the bucket unambiguous once a second tenant exists.
  return `informe-mensual-${companyId}-${year}-${String(month).padStart(2, "0")}.pdf`;
}

/**
 * Renders the report and writes it to `STORAGE_DIR/exports`.
 *
 * Re-closing a period rewrites this file. That is deliberate and does not
 * touch the tax-document rule: the *filing snapshot* is the immutable record,
 * this PDF is a rendering of it that can always be reproduced.
 */
export async function saveMonthlyReportPdf(
  companyId: string,
  year: number,
  month: number
): Promise<string> {
  const pdf = await renderMonthlyReportPdf(companyId, year, month);
  return saveFile("exports", monthlyReportFilename(companyId, year, month), pdf);
}

/** The locale a company's mail is written in: its first user's. */
async function companyLocale(companyId: string): Promise<Locale> {
  const user = await prisma.user.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { locale: true },
  });
  return normalizeLocale(user?.locale);
}

export interface SendReportPayload {
  companyId: string;
  year: number;
  month: number;
}

/**
 * `send_report` job handler: emails the monthly close report.
 *
 * Enqueued after a successful period close. No-ops cleanly when SMTP is
 * unconfigured or nobody has an address, so closing a period never fails for
 * want of a mailer.
 */
export async function sendCloseReport(payload: SendReportPayload): Promise<void> {
  if (!smtpConfigured()) return;

  const recipients = await reminderRecipients(payload.companyId);
  if (recipients.length === 0) return;

  const path = await saveMonthlyReportPdf(payload.companyId, payload.year, payload.month);
  const company = await prisma.company.findUnique({
    where: { id: payload.companyId },
    select: { razonSocial: true },
  });
  const dict = getDict(await companyLocale(payload.companyId));
  const period = `${payload.year}-${String(payload.month).padStart(2, "0")}`;
  const vars = { company: company?.razonSocial ?? "", detail: period };

  await sendInvoiceEmail({
    to: recipients.join(", "),
    subject: translate(dict, "notifications.close_report.subject", vars),
    text: [
      translate(dict, "notifications.close_report.body", vars),
      "",
      translate(dict, "notifications.footer", vars),
    ].join("\n"),
    attachments: [{ path }],
  });
}
