/**
 * IRP — Impuesto a la Renta Personal, annual working draft (PLAN Phase 7).
 *
 * Same shape and same promises as `form120.ts`, one rung up the calendar: the
 * arithmetic lives in `computeIrp` (pure, fixture-tested) and DB access in
 * `buildIrp`. It aggregates the twelve months of Libro Ventas / Libro Compras
 * the monthly close already trusts, so the annual figures cannot disagree with
 * the monthly ones — there is only one source.
 *
 * Like the F.120 draft this is a **preparation aid**, not the official form:
 * it produces the numbers to transcribe into the IRP return in Marangatú, and
 * the UI and PDF label it "borrador de trabajo". We do not file it.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ TWO THINGS ARE DELIBERATELY NOT SETTLED HERE — READ BEFORE USING IN ANGER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * **1. Which regime.** IRP splits into rentas derivadas de la prestación de
 * SERVICIOS PERSONALES (RSP) and rentas y ganancias del CAPITAL (RGC), and
 * they are different taxes with different bases. PLAN Phase 7 §4 says to
 * confirm which regime the wedge users are in and build that one first — and
 * neither PLAN.md nor STRATEGY.md answers it. So nothing here picks: the
 * calculation is **regime-parameterized** (`IRP_REGIMES` is a data table, the
 * engine reads it), RSP is wired end to end, and RGC is present as a declared
 * `stub` whose filings the close flow refuses. Answering the question is a
 * one-line change to a table, not a rewrite.
 *
 * **2. The rates are corroborated, not verified.** `IRP_REGIMES` below is
 * attributed to Ley N° 6380/2019 and its Decreto reglamentario N° 3184/2019,
 * and agrees across several independent secondary sources — but it was NOT
 * read off a primary document: this build environment's egress proxy denies
 * dnit.gov.py, bacn.gov.py and impuestospy.com, exactly as it denies the
 * source behind `PERPETUAL_CALENDAR` in `tax/calendar.ts`. Confirm the
 * bracket table, the incidence threshold and the deduction rules against the
 * DNIT/BACN text **before the first production filing**, not "eventually".
 *
 * A third caveat is about *our* data rather than the law, and is surfaced in
 * the UI rather than buried here — see `DEDUCIBILITY_PROXY_NOTE`.
 */
import { prisma } from "@/lib/prisma";
import { libroVentas, libroCompras, type LibroTotals } from "@/lib/accounting";

/** The two IRP regimes. Not an enum in the schema — a filing stores its code. */
export type IrpRegime = "RSP" | "RGC";

export const IRP_REGIMES_ORDER: readonly IrpRegime[] = ["RSP", "RGC"];

export function isIrpRegime(value: unknown): value is IrpRegime {
  return typeof value === "string" && (IRP_REGIMES_ORDER as readonly string[]).includes(value);
}

/**
 * One tranche of a progressive scale.
 *
 * `upTo` is the inclusive upper bound of the tranche in guaraníes; `null`
 * means unbounded, which the last tranche must be. `rate` is a fraction
 * (0.08 = 8%) applied ONLY to the portion of the base inside this tranche —
 * the scale is progressive, not a cliff.
 */
export interface IrpBracket {
  upTo: number | null;
  rate: number;
}

export interface IrpRegimeRules {
  code: IrpRegime;
  /** Ascending by `upTo`; the last entry is unbounded. */
  brackets: readonly IrpBracket[];
  /**
   * Annual gross income at or below which the taxpayer has formal obligations
   * but owes no tax. `null` = liable from the first guaraní.
   */
  incidenceThreshold: number | null;
  /** Whether deductible expenses reduce the taxable base. */
  deductsExpenses: boolean;
  /**
   * `ready` — wired end to end and closable.
   * `stub` — the scaffold exists so the engine is genuinely parameterized,
   * but the rules were never confirmed. The draft renders with a warning and
   * the close is refused; a declared snapshot may not rest on a guess.
   */
  status: "ready" | "stub";
}

/**
 * The regime table. **Data, not arithmetic** — same discipline as
 * `PERPETUAL_CALENDAR`: when a resolution moves a threshold or a rate, that
 * must stay a one-line edit here rather than a rewrite of a formula.
 *
 * Attributed to Ley N° 6380/2019 (IRP) + Decreto N° 3184/2019. ⚠️ NOT read
 * off the primary text — see the module banner.
 */
export const IRP_REGIMES: Readonly<Record<IrpRegime, IrpRegimeRules>> = {
  // Rentas derivadas de la prestación de servicios personales.
  RSP: {
    code: "RSP",
    brackets: [
      { upTo: 50_000_000, rate: 0.08 },
      { upTo: 150_000_000, rate: 0.09 },
      { upTo: null, rate: 0.1 },
    ],
    incidenceThreshold: 80_000_000,
    deductsExpenses: true,
    status: "ready",
  },
  // Rentas y ganancias del capital. Flat rate, and a base that is NOT
  // "income minus business expenses" — which is why it is a stub rather than
  // RSP with one number changed.
  RGC: {
    code: "RGC",
    brackets: [{ upTo: null, rate: 0.08 }],
    incidenceThreshold: null,
    deductsExpenses: false,
    status: "stub",
  },
};

/**
 * Why the deducible figures are a proxy, in one sentence the UI can show.
 *
 * The percentages come from the Phase 2 decisions, which answer "may this
 * purchase's IVA be credited?" — a different legal test from "is this cost
 * deductible against personal income tax?". They overlap heavily in practice
 * (both turn on the cost being affected to the taxed activity) and they are
 * the only per-expense judgement a human has actually made in this system, so
 * they are what the draft uses. The draft says so rather than implying the
 * number is an IRP determination.
 */
export const DEDUCIBILITY_PROXY_NOTE = "iva_deducibility_reused" as const;

export interface IrpBracketSlice {
  /** Lower bound of the portion taxed at `rate` (exclusive of the previous tranche). */
  from: number;
  /** Upper bound, or null for the unbounded tranche. */
  to: number | null;
  rate: number;
  /** How much of the base fell inside this tranche. */
  base: number;
  /** Tax contributed by this tranche. */
  tax: number;
}

export interface IrpData {
  year: number;
  regime: IrpRegime;
  /** Copied into the snapshot so a closed filing carries the scale it used. */
  rules: IrpRegimeRules;
  ingresos: {
    /** IVA-exclusive bases, straight from the Libro Ventas. */
    gravado10: number;
    gravado5: number;
    exentas: number;
    /** IVA charged on sales. Collected for the State — never income. */
    ivaFacturado: number;
    /** IVA-included invoiced total, for tying back to the libro. */
    totalFacturado: number;
    /** The income base: gravado10 + gravado5 + exentas. */
    rentaBruta: number;
  };
  egresos: {
    gravado10: number;
    gravado5: number;
    exentas: number;
    /** Purchase IVA that was NOT credited and therefore sits in cost. */
    ivaNoDeducible: number;
    totalFacturado: number;
    /** Share of the 10% / 5% purchase base the deducibility decisions kept. */
    fraccionDeducible10: number;
    fraccionDeducible5: number;
    /** The kept part of each base, and the exempt purchases. */
    deducible10: number;
    deducible5: number;
    deducibleExentas: number;
    /** Total cost carried into the base. */
    egresoDeducible: number;
    /** The part the decisions excluded — shown, never silently dropped. */
    egresoNoDeducible: number;
  };
  /** max(0, rentaBruta − egresoDeducible), or rentaBruta when the regime
   *  does not deduct expenses. */
  rentaNetaImponible: number;
  /** True when gross income is at or below the regime's incidence threshold:
   *  formal obligations remain, the tax is zero. */
  noIncidido: boolean;
  bracketBreakdown: IrpBracketSlice[];
  /** The tax the scale implies. Zero when `noIncidido`. */
  impuesto: number;
  documentCounts: { ventas: number; compras: number };
  /** Months of the year with at least one document, so a part-year is visible. */
  mesesConMovimiento: number[];
}

/**
 * Applies a progressive scale to a base. Pure, and the reason the regimes are
 * a table: this function never learns a rate.
 *
 * Returns one slice per tranche the base actually reaches, so the caller can
 * show the derivation instead of a single unexplained number. PYG has no
 * decimals, so each slice is rounded and the total is the sum of the rounded
 * slices — the breakdown always adds up to the tax shown.
 */
export function applyBrackets(
  brackets: readonly IrpBracket[],
  base: number
): IrpBracketSlice[] {
  const slices: IrpBracketSlice[] = [];
  if (!(base > 0)) return slices;

  let floor = 0;
  for (const bracket of brackets) {
    const ceiling = bracket.upTo ?? Infinity;
    const portion = Math.min(base, ceiling) - floor;
    if (portion > 0) {
      slices.push({
        from: floor,
        to: bracket.upTo,
        rate: bracket.rate,
        base: Math.round(portion),
        tax: Math.round(portion * bracket.rate),
      });
    }
    floor = ceiling;
    if (base <= ceiling) break;
  }
  return slices;
}

/** The tax a scale produces for a base — the sum of the rounded slices. */
export function bracketTax(brackets: readonly IrpBracket[], base: number): number {
  return applyBrackets(brackets, base).reduce((sum, slice) => sum + slice.tax, 0);
}

/**
 * The fraction of a purchase base the deducibility decisions kept.
 *
 * Derived from the IVA the decisions credited against the IVA the invoices
 * carried, because that ratio *is* the decision, aggregated. With no IVA at
 * that rate there is no decision to read, and the base (zero) is unaffected
 * either way, so the fraction is 1.
 */
export function deducibleFraction(ivaTotal: number, ivaDeducible: number): number {
  if (!(ivaTotal > 0)) return 1;
  const fraction = ivaDeducible / ivaTotal;
  if (!Number.isFinite(fraction)) return 1;
  return Math.min(1, Math.max(0, fraction));
}

export function computeIrp(
  year: number,
  regime: IrpRegime,
  ventas: LibroTotals,
  compras: LibroTotals,
  documentCounts: { ventas: number; compras: number },
  mesesConMovimiento: number[] = []
): IrpData {
  const rules = IRP_REGIMES[regime];

  const rentaBruta = Math.round(ventas.gravada10 + ventas.gravada5 + ventas.exenta);

  const fraccionDeducible10 = deducibleFraction(compras.iva10, compras.ivaDeducible10);
  const fraccionDeducible5 = deducibleFraction(compras.iva5, compras.ivaDeducible5);
  const deducible10 = Math.round(compras.gravada10 * fraccionDeducible10);
  const deducible5 = Math.round(compras.gravada5 * fraccionDeducible5);
  // Exempt purchases carry no IVA, so the Phase 2 decision says nothing about
  // them. They are real costs, so they are counted — and shown on their own
  // line, because "no decision was made here" is worth seeing.
  const deducibleExentas = Math.round(compras.exenta);
  const egresoDeducible = deducible10 + deducible5 + deducibleExentas;
  const egresoBase = Math.round(compras.gravada10 + compras.gravada5 + compras.exenta);

  const rentaNetaImponible = rules.deductsExpenses
    ? Math.max(0, rentaBruta - egresoDeducible)
    : rentaBruta;

  const noIncidido =
    rules.incidenceThreshold !== null && rentaBruta <= rules.incidenceThreshold;

  const bracketBreakdown = noIncidido ? [] : applyBrackets(rules.brackets, rentaNetaImponible);
  const impuesto = bracketBreakdown.reduce((sum, slice) => sum + slice.tax, 0);

  return {
    year,
    regime,
    rules,
    ingresos: {
      gravado10: ventas.gravada10,
      gravado5: ventas.gravada5,
      exentas: ventas.exenta,
      ivaFacturado: Math.round(ventas.iva10 + ventas.iva5),
      totalFacturado: ventas.total,
      rentaBruta,
    },
    egresos: {
      gravado10: compras.gravada10,
      gravado5: compras.gravada5,
      exentas: compras.exenta,
      ivaNoDeducible: Math.max(
        0,
        Math.round(
          compras.iva10 + compras.iva5 - compras.ivaDeducible10 - compras.ivaDeducible5
        )
      ),
      totalFacturado: compras.total,
      fraccionDeducible10,
      fraccionDeducible5,
      deducible10,
      deducible5,
      deducibleExentas,
      egresoDeducible,
      egresoNoDeducible: Math.max(0, egresoBase - egresoDeducible),
    },
    rentaNetaImponible,
    noIncidido,
    bracketBreakdown,
    impuesto,
    documentCounts,
    mesesConMovimiento,
  };
}

/** Adds two libro totals. Used to fold twelve months into a fiscal year. */
export function addLibroTotals(a: LibroTotals, b: LibroTotals): LibroTotals {
  return {
    gravada10: a.gravada10 + b.gravada10,
    gravada5: a.gravada5 + b.gravada5,
    exenta: a.exenta + b.exenta,
    iva10: a.iva10 + b.iva10,
    iva5: a.iva5 + b.iva5,
    total: a.total + b.total,
    ivaDeducible10: a.ivaDeducible10 + b.ivaDeducible10,
    ivaDeducible5: a.ivaDeducible5 + b.ivaDeducible5,
    ivaDeducible: a.ivaDeducible + b.ivaDeducible,
  };
}

export function emptyLibroTotals(): LibroTotals {
  return {
    gravada10: 0,
    gravada5: 0,
    exenta: 0,
    iva10: 0,
    iva5: 0,
    total: 0,
    ivaDeducible10: 0,
    ivaDeducible5: 0,
    ivaDeducible: 0,
  };
}

/**
 * The fiscal year's IRP draft.
 *
 * The twelve months are read through the SAME `libroVentas`/`libroCompras`
 * the monthly close uses, one month at a time, so an annual figure is by
 * construction the sum of the monthly ones a client already reviewed. IRP's
 * ejercicio fiscal is the calendar year.
 */
export async function buildIrp(
  companyId: string,
  year: number,
  regime: IrpRegime
): Promise<IrpData> {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const libros = await Promise.all(
    months.map(async (month) => ({
      month,
      ventas: await libroVentas(companyId, year, month),
      compras: await libroCompras(companyId, year, month),
    }))
  );

  let ventas = emptyLibroTotals();
  let compras = emptyLibroTotals();
  let ventasCount = 0;
  let comprasCount = 0;
  const mesesConMovimiento: number[] = [];

  for (const libro of libros) {
    ventas = addLibroTotals(ventas, libro.ventas.totals);
    compras = addLibroTotals(compras, libro.compras.totals);
    ventasCount += libro.ventas.rows.length;
    comprasCount += libro.compras.rows.length;
    if (libro.ventas.rows.length > 0 || libro.compras.rows.length > 0) {
      mesesConMovimiento.push(libro.month);
    }
  }

  return computeIrp(
    year,
    regime,
    ventas,
    compras,
    { ventas: ventasCount, compras: comprasCount },
    mesesConMovimiento
  );
}

/**
 * The company's IRP regime, stored like `saldoAnterior` — a `Setting` row.
 *
 * Returns null when it was never chosen. That is a real state, not a default
 * to paper over: the draft renders with the regime the user is *previewing*
 * and refuses to close until someone has actually declared which regime the
 * taxpayer is in.
 */
const REGIME_KEY = "irp.regime";

export async function getIrpRegime(companyId: string): Promise<IrpRegime | null> {
  const setting = await prisma.setting.findUnique({
    where: { companyId_key: { companyId, key: REGIME_KEY } },
  });
  return isIrpRegime(setting?.value) ? setting.value : null;
}

export async function setIrpRegime(companyId: string, regime: IrpRegime): Promise<void> {
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: REGIME_KEY } },
    update: { value: regime },
    create: { companyId, key: REGIME_KEY, value: regime },
  });
}
