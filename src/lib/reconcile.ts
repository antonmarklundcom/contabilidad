/**
 * Monthly reconciliation checks — the discrepancy list behind the
 * "declaración jurada" close. We can produce this natively because we are
 * the emitter (see PLAN.md Phase 1 §2): unlike a tool that only reads
 * Marangatú after the fact, we know the moment a document leaves DRAFT.
 */
import { prisma } from "@/lib/prisma";

export interface UnresolvedInvoice {
  id: string;
  fullNumber: string | null;
  status: string;
  issueDate: Date;
  total: number;
  clientName: string;
}

export interface UnresolvedExpense {
  id: string;
  supplierRazonSocial: string | null;
  numeroComprobante: string | null;
  fecha: Date | null;
  total: number;
  reason: "NEEDS_REVIEW" | "DUPLICATE_SUSPECT";
}

/**
 * A run of reserved-but-missing document numbers in one series.
 *
 * Only the emitter can produce this list (STRATEGY §"We emit; they observe"):
 * it compares the numbers the sequence actually handed out against the
 * documents that exist.
 */
export interface SequenceGap {
  establecimiento: string;
  punto: string;
  tipoDocumento: number;
  /** First missing number in the run. */
  from: number;
  /** Last missing number in the run (equal to `from` for a single number). */
  to: number;
  count: number;
  /** True when the run sits above every document that exists — a number the
   *  sequence reserved and no document ever claimed (a crash between the
   *  atomic increment and the insert). */
  trailing: boolean;
}

/** One (establecimiento, punto, tipoDocumento) series, as `findSequenceGaps` needs it. */
export interface SequenceSeries {
  establecimiento: string;
  punto: string;
  tipoDocumento: number;
  /** Numbers assigned to documents dated inside the period under review. */
  periodNumbers: number[];
  /** Every number this series ever assigned, whatever the period or status. */
  allNumbers: number[];
  /** `DocumentSequence.currentNumber` — the highest number ever handed out. */
  currentNumber: number;
}

/**
 * Missing document numbers in the period's range, per series. Pure.
 *
 * The window is the period's own numbers — from the lowest to the highest
 * number the period used — so a company that started mid-sequence is not
 * accused of a 500-number gap it never emitted. Membership is checked against
 * the series' *whole* history, because a back-dated document in another period
 * legitimately owns a number inside this period's range.
 *
 * The one exception is the trailing run: when the period holds the newest
 * document in the series and the sequence counter has moved past it, those
 * numbers were reserved and never used, which is worth showing exactly once —
 * on the period that owns the newest document.
 *
 * A cancelled or rejected document still *uses* its number, so it is not a
 * gap; the number is burned either way.
 */
export function findSequenceGaps(series: readonly SequenceSeries[]): SequenceGap[] {
  const gaps: SequenceGap[] = [];

  for (const s of series) {
    if (s.periodNumbers.length === 0) continue;
    const used = new Set(s.allNumbers);
    const lower = Math.min(...s.periodNumbers);
    const upper = Math.max(...s.periodNumbers);
    const highestEver = s.allNumbers.length > 0 ? Math.max(...s.allNumbers) : upper;

    const missing: number[] = [];
    for (let n = lower; n <= upper; n++) if (!used.has(n)) missing.push(n);

    // Reserved but never persisted, reported on the period holding the newest
    // document so it is not repeated month after month.
    const trailingFrom = highestEver + 1;
    const trailingNumbers: number[] =
      upper === highestEver && s.currentNumber >= trailingFrom
        ? Array.from({ length: s.currentNumber - highestEver }, (_, i) => trailingFrom + i)
        : [];

    for (const [numbers, trailing] of [
      [missing, false],
      [trailingNumbers, true],
    ] as const) {
      let runStart: number | null = null;
      let previous: number | null = null;
      for (const n of numbers) {
        if (runStart === null) {
          runStart = n;
        } else if (previous !== null && n !== previous + 1) {
          gaps.push(makeGap(s, runStart, previous, trailing));
          runStart = n;
        }
        previous = n;
      }
      if (runStart !== null && previous !== null) {
        gaps.push(makeGap(s, runStart, previous, trailing));
      }
    }
  }

  return gaps;
}

function makeGap(
  s: SequenceSeries,
  from: number,
  to: number,
  trailing: boolean
): SequenceGap {
  return {
    establecimiento: s.establecimiento,
    punto: s.punto,
    tipoDocumento: s.tipoDocumento,
    from,
    to,
    count: to - from + 1,
    trailing,
  };
}

export interface ReconciliationData {
  year: number;
  month: number;
  /** Invoices dated in the period that never reached APPROVED. */
  unresolvedInvoices: UnresolvedInvoice[];
  /** Expenses dated in the period still needing review, or flagged as duplicates. */
  unresolvedExpenses: UnresolvedExpense[];
  /**
   * Numbers the sequence handed out with no document to show for them.
   *
   * Deliberately NOT part of `clean`: a burned number cannot be un-burned, so
   * blocking the close on it would block it forever. It is a disclosure — the
   * kind of thing to explain to DNIT before DNIT asks — not a to-do.
   */
  sequenceGaps: SequenceGap[];
  clean: boolean;
}

function periodRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export async function buildReconciliation(
  companyId: string,
  year: number,
  month: number
): Promise<ReconciliationData> {
  const { start, end } = periodRange(year, month);

  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      issueDate: { gte: start, lt: end },
      status: { in: ["DRAFT", "QUEUED", "SENT", "REJECTED", "CONTINGENCY"] },
    },
    include: { client: { select: { razonSocial: true } } },
    orderBy: { issueDate: "asc" },
  });

  const expensesNeedsReview = await prisma.expense.findMany({
    where: { companyId, fecha: { gte: start, lt: end }, status: "NEEDS_REVIEW" },
    orderBy: { fecha: "asc" },
  });

  const expensesDuplicates = await prisma.expense.findMany({
    where: {
      companyId,
      fecha: { gte: start, lt: end },
      duplicateOfId: { not: null },
    },
    orderBy: { fecha: "asc" },
  });

  const sequenceGaps = await buildSequenceGaps(companyId, start, end);

  const unresolvedInvoices: UnresolvedInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    fullNumber: inv.fullNumber,
    status: inv.status,
    issueDate: inv.issueDate,
    total: Number(inv.total),
    clientName: inv.client.razonSocial,
  }));

  const unresolvedExpenses: UnresolvedExpense[] = [
    ...expensesNeedsReview.map((e) => ({
      id: e.id,
      supplierRazonSocial: e.supplierRazonSocial,
      numeroComprobante: e.numeroComprobante,
      fecha: e.fecha,
      total: Number(e.total),
      reason: "NEEDS_REVIEW" as const,
    })),
    ...expensesDuplicates.map((e) => ({
      id: e.id,
      supplierRazonSocial: e.supplierRazonSocial,
      numeroComprobante: e.numeroComprobante,
      fecha: e.fecha,
      total: Number(e.total),
      reason: "DUPLICATE_SUSPECT" as const,
    })),
  ];

  return {
    year,
    month,
    unresolvedInvoices,
    unresolvedExpenses,
    sequenceGaps,
    clean: unresolvedInvoices.length === 0 && unresolvedExpenses.length === 0,
  };
}

/** Reads the series a company emitted and hands them to `findSequenceGaps`. */
async function buildSequenceGaps(
  companyId: string,
  start: Date,
  end: Date
): Promise<SequenceGap[]> {
  // Every numbered document, whatever its status: a cancelled or rejected
  // invoice still consumed its number.
  const numbered = await prisma.invoice.findMany({
    where: { companyId, numero: { not: null } },
    select: {
      establecimiento: true,
      punto: true,
      tipoDocumento: true,
      numero: true,
      issueDate: true,
    },
  });

  const sequences = await prisma.documentSequence.findMany({
    where: { companyId },
    select: {
      tipoDocumento: true,
      currentNumber: true,
      expeditionPoint: {
        select: { codigo: true, establishment: { select: { codigo: true } } },
      },
    },
  });

  const series = new Map<string, SequenceSeries>();
  const key = (est: string, punto: string, tipo: number) => `${est}-${punto}-${tipo}`;

  for (const seq of sequences) {
    const est = seq.expeditionPoint.establishment.codigo;
    const punto = seq.expeditionPoint.codigo;
    series.set(key(est, punto, seq.tipoDocumento), {
      establecimiento: est,
      punto,
      tipoDocumento: seq.tipoDocumento,
      periodNumbers: [],
      allNumbers: [],
      currentNumber: seq.currentNumber,
    });
  }

  for (const inv of numbered) {
    const n = Number(inv.numero);
    if (!Number.isFinite(n)) continue;
    const k = key(inv.establecimiento, inv.punto, inv.tipoDocumento);
    // A series with documents but no DocumentSequence row (imported history)
    // is still worth checking; currentNumber 0 simply means no trailing run.
    const entry =
      series.get(k) ??
      series
        .set(k, {
          establecimiento: inv.establecimiento,
          punto: inv.punto,
          tipoDocumento: inv.tipoDocumento,
          periodNumbers: [],
          allNumbers: [],
          currentNumber: 0,
        })
        .get(k)!;
    entry.allNumbers.push(n);
    if (inv.issueDate >= start && inv.issueDate < end) entry.periodNumbers.push(n);
  }

  return findSequenceGaps([...series.values()]);
}
