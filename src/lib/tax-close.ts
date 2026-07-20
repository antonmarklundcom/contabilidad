/**
 * Period-close artifacts & delivery (PLAN.md Phase 4).
 *
 * On close we freeze the figures twice: the JSON snapshot inside the
 * PeriodClose record (form120.ts) and the two PDFs (F.120 working draft +
 * informe mensual) stored under exports/. Tax-doc policy applies: the
 * stored PDFs are never deleted, and the export routes serve the frozen
 * file when the period is closed so late edits can't silently change an
 * already-signed month.
 *
 * Delivery: `send_report` job emails the frozen PDFs; the cron entry
 * point enqueues a declaration reminder a few days before the perpetual-
 * calendar due date if the previous period isn't closed yet.
 */
import { prisma } from "@/lib/prisma";
import { libroVentas, libroCompras } from "@/lib/accounting";
import { computeDeducible } from "@/lib/deductibility";
import {
  buildForm120,
  getPeriodClose,
  type Form120Data,
  type PeriodClose,
} from "@/lib/form120";
import {
  generateForm120Pdf,
  generateMonthlyReportPdf,
  periodLabel,
  type CategoryBreakdownRow,
  type MonthlyReportInput,
} from "@/lib/tax-report";
import { getSifenMode } from "@/lib/sifen";
import { saveFile, storagePath } from "@/lib/storage";
import { sendInvoiceEmail, smtpConfigured } from "@/lib/mailer";
import { enqueueJob } from "@/lib/jobs/queue";
import { f120DueDate, daysUntil, previousPeriod } from "@/lib/tax-calendar";

const pad = (n: number) => String(n).padStart(2, "0");

/** Everything the informe mensual PDF needs, from live data. */
export async function buildMonthlyReportInput(
  companyId: string,
  year: number,
  month: number,
  form120?: Form120Data
): Promise<MonthlyReportInput> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const [f120, ventas, compras, expenses, pendingReviewCount] = await Promise.all([
    form120 ?? buildForm120(companyId, year, month),
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
    form120: f120,
    ventasTotals: ventas.totals,
    comprasTotals: compras.totals,
    categories,
    pendingReviewCount,
  };
}

/**
 * Generates the two close PDFs from the snapshot's period and stores them
 * under exports/. Returns the stored filenames for the PeriodClose record.
 */
export async function generateCloseArtifacts(
  companyId: string,
  snapshot: Form120Data
): Promise<NonNullable<PeriodClose["files"]>> {
  const { year, month } = snapshot;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const mode = getSifenMode();
  const reportInput = await buildMonthlyReportInput(companyId, year, month, snapshot);

  const [form120Pdf, reportPdf] = await Promise.all([
    generateForm120Pdf(company, snapshot, mode),
    generateMonthlyReportPdf(company, reportInput, mode),
  ]);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const form120Name = `cierre-${year}-${pad(month)}-form120-${stamp}.pdf`;
  const reportName = `cierre-${year}-${pad(month)}-informe-${stamp}.pdf`;
  await saveFile("exports", form120Name, form120Pdf);
  await saveFile("exports", reportName, reportPdf);
  return { form120: form120Name, report: reportName };
}

/** Job handler for `send_report`: emails the frozen close PDFs. */
export async function sendCloseReport(
  companyId: string,
  year: number,
  month: number
): Promise<void> {
  if (!smtpConfigured()) return;
  const [company, close] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    getPeriodClose(companyId, year, month),
  ]);
  if (!company.email || !close?.files) return;

  const label = periodLabel(year, month);
  const f = close.snapshot;
  const liquidacion =
    f.aPagar > 0
      ? `IVA a pagar: Gs. ${f.aPagar.toLocaleString("es-PY")}`
      : `Saldo a favor para el período siguiente: Gs. ${f.saldoAFavor.toLocaleString("es-PY")}`;

  await sendInvoiceEmail({
    to: company.email,
    subject: `Cierre de ${label} — borrador F.120 e informe mensual`,
    text:
      `Se cerró el período ${label} (aprobado por ${close.closedBy}).\n\n` +
      `${liquidacion}\n` +
      `Débito fiscal: Gs. ${f.ventas.debitoFiscal.toLocaleString("es-PY")} · ` +
      `Crédito fiscal: Gs. ${f.compras.creditoFiscal.toLocaleString("es-PY")}\n\n` +
      `Se adjuntan el borrador de trabajo del Formulario 120 (para cargar en Marangatu) ` +
      `y el informe mensual completo.\n\n— FacturaPY`,
    attachments: [
      { path: storagePath("exports", close.files.form120), filename: `form120-borrador-${year}-${pad(month)}.pdf` },
      { path: storagePath("exports", close.files.report), filename: `informe-mensual-${year}-${pad(month)}.pdf` },
    ],
  });
}

const reminderKey = (year: number, month: number) => `f120.reminder.${year}-${pad(month)}`;

/** Days before the due date at which the reminder goes out. */
export const REMINDER_DAYS_BEFORE = 5;

/**
 * Called from /api/cron. If the previous period is not closed and its
 * F.120 due date (perpetual calendar) is within REMINDER_DAYS_BEFORE days,
 * emails a one-time "your draft is waiting" reminder. The sent marker is a
 * Setting row, so the reminder fires at most once per period per company.
 */
export async function enqueueDeclarationReminderIfDue(now = new Date()): Promise<void> {
  if (!smtpConfigured()) return;
  const companies = await prisma.company.findMany({ where: { email: { not: null } } });
  const { year, month } = previousPeriod(now);

  for (const company of companies) {
    const due = f120DueDate(company.ruc, year, month);
    const days = daysUntil(now, due);
    if (days > REMINDER_DAYS_BEFORE) continue;

    const [close, alreadySent] = await Promise.all([
      getPeriodClose(company.id, year, month),
      prisma.setting.findUnique({
        where: { companyId_key: { companyId: company.id, key: reminderKey(year, month) } },
      }),
    ]);
    if (close || alreadySent) continue;

    // Mark before enqueueing so a concurrent cron run can't double-send.
    await prisma.setting.create({
      data: { companyId: company.id, key: reminderKey(year, month), value: new Date().toISOString() },
    });
    await enqueueJob("declaration_reminder", { companyId: company.id, year, month });
  }
}

/** Job handler for `declaration_reminder`. */
export async function sendDeclarationReminder(
  companyId: string,
  year: number,
  month: number
): Promise<void> {
  if (!smtpConfigured()) return;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (!company.email) return;
  // Closed between enqueue and send → nothing to remind about.
  if (await getPeriodClose(companyId, year, month)) return;

  const due = f120DueDate(company.ruc, year, month);
  const label = periodLabel(year, month);
  const dueLabel = due.toLocaleDateString("es-PY", { timeZone: "UTC" });

  await sendInvoiceEmail({
    to: company.email,
    subject: `Recordatorio: el F.120 de ${label} vence el ${dueLabel}`,
    text:
      `El período ${label} todavía no está cerrado en FacturaPY.\n\n` +
      `Según el calendario perpetuo de vencimientos (terminación de RUC), el Formulario 120 ` +
      `vence el ${dueLabel}. Entrá a la sección Impuestos, revisá la conciliación y cerrá el ` +
      `período — el borrador ya está preparado con los datos cargados.\n\n— FacturaPY`,
    attachments: [],
  });
}
