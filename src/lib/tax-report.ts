/**
 * Tax PDFs (pdfkit, like kude.ts):
 *  - Formulario 120 working draft: the month's IVA figures, laid out to be
 *    typed into the real F120 in Marangatu. Labeled "borrador de trabajo" —
 *    it is NOT the official form.
 *  - Informe mensual: the full month in one document (ventas, compras,
 *    deducibilidad, posición IVA, gastos por categoría).
 *  - IRP anual: the fiscal year's income, deducible costs, taxable base and
 *    the bracket-by-bracket derivation of the tax. Also a "borrador de
 *    trabajo" — we do not file it.
 * Tax documents are Spanish-only, like the KuDE.
 */
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";
import type { Form120Data } from "@/lib/form120";
import type { IrpData } from "@/lib/irp";
import type { LibroTotals } from "@/lib/accounting";
import { formatRuc } from "@/lib/sifen/ruc";

const money = (v: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(v));

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const periodLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

function newDoc(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );
  return { doc, done };
}

function header(doc: PDFKit.PDFDocument, company: Company, title: string, period: string) {
  const W = doc.page.width - 80;
  doc.roundedRect(40, 40, W, 64, 4).stroke("#999");
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111");
  doc.text(company.razonSocial, 50, 50, { width: W * 0.6 });
  doc.font("Helvetica").fontSize(9).fillColor("#333");
  doc.text(`RUC: ${formatRuc(company.ruc, company.dv)}`, 50, doc.y + 2);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111");
  doc.text(title, 40 + W * 0.55, 52, { width: W * 0.45 - 10, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  doc.text(`Período: ${period}`, 40 + W * 0.55, doc.y + 3, { width: W * 0.45 - 10, align: "right" });
  return 120;
}

function sectionTitle(doc: PDFKit.PDFDocument, y: number, text: string): number {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111").text(text, 40, y);
  doc.moveTo(40, doc.y + 3).lineTo(doc.page.width - 40, doc.y + 3).stroke("#ccc");
  return doc.y + 9;
}

function amountRows(
  doc: PDFKit.PDFDocument,
  y: number,
  rows: [string, number, boolean?][]
): number {
  const W = doc.page.width - 80;
  doc.fontSize(9.5);
  for (const [label, value, bold] of rows) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#111" : "#333");
    doc.text(label, 48, y, { width: W * 0.62 });
    doc.text(money(value), 40 + W * 0.62, y, { width: W * 0.38 - 8, align: "right" });
    y += 15;
  }
  return y + 4;
}

function disclaimer(doc: PDFKit.PDFDocument, text: string) {
  const W = doc.page.width - 80;
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#666")
    .text(text, 40, doc.page.height - 70, { width: W });
}

export async function generateForm120Pdf(
  company: Company,
  data: Form120Data,
  mode: string
): Promise<Buffer> {
  const { doc, done } = newDoc();
  let y = header(
    doc,
    company,
    "IVA General — preparación Formulario 120",
    periodLabel(data.year, data.month)
  );

  doc
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .fillColor("#a15c00")
    .text(
      "BORRADOR DE TRABAJO — no es el formulario oficial. Cargá estos importes en el Formulario 120 dentro de Marangatu.",
      40,
      y
    );
  y = doc.y + 14;

  y = sectionTitle(doc, y, "Débito fiscal (ventas del período)");
  y = amountRows(doc, y, [
    ["Ventas gravadas al 10% (base)", data.ventas.gravada10],
    ["IVA débito 10%", data.ventas.debito10],
    ["Ventas gravadas al 5% (base)", data.ventas.gravada5],
    ["IVA débito 5%", data.ventas.debito5],
    ["Ventas exentas / no gravadas", data.ventas.exentas],
    ["TOTAL DÉBITO FISCAL", data.ventas.debitoFiscal, true],
  ]);

  y = sectionTitle(doc, y, "Crédito fiscal (compras del período — solo IVA deducible)");
  y = amountRows(doc, y, [
    ["Compras gravadas al 10% (base)", data.compras.gravada10],
    ["IVA compras 10%", data.compras.iva10],
    ["Crédito deducible 10%", data.compras.credito10],
    ["Compras gravadas al 5% (base)", data.compras.gravada5],
    ["IVA compras 5%", data.compras.iva5],
    ["Crédito deducible 5%", data.compras.credito5],
    ["IVA no deducible (va al costo)", data.compras.ivaNoDeducible],
    ["TOTAL CRÉDITO FISCAL", data.compras.creditoFiscal, true],
  ]);

  y = sectionTitle(doc, y, "Liquidación");
  y = amountRows(doc, y, [
    ["Débito fiscal", data.ventas.debitoFiscal],
    ["(-) Crédito fiscal", data.compras.creditoFiscal],
    ["(-) Saldo a favor del período anterior", data.saldoAnterior],
    data.aPagar > 0
      ? ["IMPUESTO A PAGAR", data.aPagar, true]
      : ["SALDO A FAVOR PARA EL PERÍODO SIGUIENTE", data.saldoAFavor, true],
  ]);

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#333")
    .text(
      `Documentos del período: ${data.documentCounts.ventas} comprobantes de venta aprobados, ` +
        `${data.documentCounts.compras} comprobantes de compra confirmados.`,
      40,
      y + 4
    );

  disclaimer(
    doc,
    "Generado por FacturaPY a partir del Libro IVA Ventas (documentos aprobados) y el Libro IVA Compras " +
      "(gastos confirmados, con la deducibilidad decidida ítem por ítem). Verificá los importes antes de presentar " +
      "el Formulario 120 en Marangatu. Este documento no sustituye el asesoramiento de un contador." +
      (mode === "mock" ? " MODO SIMULACIÓN: los datos pueden incluir documentos sin valor fiscal." : "")
  );

  doc.end();
  return done;
}

export interface CategoryBreakdownRow {
  name: string;
  total: number;
  ivaDeducible: number;
  count: number;
}

export interface MonthlyReportInput {
  form120: Form120Data;
  ventasTotals: LibroTotals;
  comprasTotals: LibroTotals;
  categories: CategoryBreakdownRow[];
  pendingReviewCount: number;
}

export async function generateMonthlyReportPdf(
  company: Company,
  input: MonthlyReportInput,
  mode: string
): Promise<Buffer> {
  const { form120: f } = input;
  const { doc, done } = newDoc();
  let y = header(doc, company, "Informe mensual", periodLabel(f.year, f.month));

  y = sectionTitle(doc, y, "Resumen del mes");
  y = amountRows(doc, y, [
    ["Ingresos (ventas aprobadas)", f.ventas.total],
    ["Egresos (compras confirmadas)", f.compras.total],
    ["Resultado operativo (ingresos - egresos)", f.ventas.total - f.compras.total, true],
  ]);

  y = sectionTitle(doc, y, "Posición IVA");
  y = amountRows(doc, y, [
    ["IVA débito (ventas)", f.ventas.debitoFiscal],
    ["IVA crédito deducible (compras)", f.compras.creditoFiscal],
    ["IVA no deducible (al costo)", f.compras.ivaNoDeducible],
    ["Saldo a favor anterior", f.saldoAnterior],
    f.aPagar > 0
      ? ["IVA A PAGAR (Formulario 120)", f.aPagar, true]
      : ["SALDO A FAVOR SIGUIENTE PERÍODO", f.saldoAFavor, true],
  ]);

  if (input.categories.length > 0) {
    y = sectionTitle(doc, y, "Gastos por categoría");
    const W = doc.page.width - 80;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333");
    doc.text("Categoría", 48, y);
    doc.text("Comprob.", 40 + W * 0.5, y, { width: W * 0.12, align: "right" });
    doc.text("Total", 40 + W * 0.62, y, { width: W * 0.18, align: "right" });
    doc.text("IVA deducible", 40 + W * 0.8, y, { width: W * 0.2 - 8, align: "right" });
    y += 14;
    doc.font("Helvetica").fontSize(9);
    for (const row of input.categories) {
      if (y > doc.page.height - 110) {
        doc.addPage();
        y = 48;
      }
      doc.fillColor("#333");
      doc.text(row.name, 48, y, { width: W * 0.5 - 10 });
      doc.text(String(row.count), 40 + W * 0.5, y, { width: W * 0.12, align: "right" });
      doc.text(money(row.total), 40 + W * 0.62, y, { width: W * 0.18, align: "right" });
      doc.text(money(row.ivaDeducible), 40 + W * 0.8, y, { width: W * 0.2 - 8, align: "right" });
      y += 14;
    }
    y += 6;
  }

  y = sectionTitle(doc, y, "Actividad del período");
  doc.font("Helvetica").fontSize(9).fillColor("#333");
  doc.text(
    [
      `Comprobantes de venta aprobados: ${f.documentCounts.ventas}`,
      `Comprobantes de compra confirmados: ${f.documentCounts.compras}`,
      `Gastos pendientes de revisión: ${input.pendingReviewCount}` +
        (input.pendingReviewCount > 0 ? " — revisalos antes de declarar" : ""),
    ].join("\n"),
    48,
    y
  );

  disclaimer(
    doc,
    "Informe generado por FacturaPY con los datos cargados en el sistema. La deducibilidad del IVA de compras " +
      "se decidió ítem por ítem y puede ajustarse en cada gasto. Este informe no sustituye el asesoramiento de un contador." +
      (mode === "mock" ? " MODO SIMULACIÓN: los datos pueden incluir documentos sin valor fiscal." : "")
  );

  doc.end();
  return done;
}


const pct = (v: number) => `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(v * 100)}%`;

/**
 * IRP annual working draft (PLAN Phase 7).
 *
 * Prints the derivation, not just the answer: the tranche table is on the
 * page so a taxpayer (or their contador) can check the arithmetic instead of
 * trusting it. Both caveats the module carries — the unverified rate table
 * and the reused IVA-deducibility decisions — are printed too. A number you
 * cannot audit is not a number you should sign.
 */
export async function generateIrpPdf(
  company: Company,
  data: IrpData,
  mode: string
): Promise<Buffer> {
  const { doc, done } = newDoc();
  const regimeName =
    data.regime === "RSP"
      ? "Rentas por servicios personales (RSP)"
      : "Rentas y ganancias del capital (RGC)";
  let y = header(doc, company, "IRP — preparación declaración anual", `Ejercicio ${data.year}`);

  doc
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .fillColor("#a15c00")
    .text(
      "BORRADOR DE TRABAJO — no es el formulario oficial. Cargá estos importes en la declaración " +
        "del IRP dentro de Marangatu.",
      40,
      y
    );
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(9).fillColor("#333").text(`Régimen: ${regimeName}`, 40, y);
  y = doc.y + 10;

  if (data.rules.status === "stub") {
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("#b00")
      .text(
        "RÉGIMEN NO VERIFICADO: las reglas del RGC no fueron confirmadas contra la norma. " +
          "Estas cifras son una referencia de trabajo y no deben presentarse sin revisión profesional.",
        40,
        y,
        { width: doc.page.width - 80 }
      );
    y = doc.y + 10;
  }

  y = sectionTitle(doc, y, "Rubro 1 — Ingresos del ejercicio");
  y = amountRows(doc, y, [
    ["Ingresos gravados al 10% (base sin IVA)", data.ingresos.gravado10],
    ["Ingresos gravados al 5% (base sin IVA)", data.ingresos.gravado5],
    ["Ingresos exentos / no gravados", data.ingresos.exentas],
    ["IVA facturado (no es ingreso — se recauda para el Estado)", data.ingresos.ivaFacturado],
    ["Total facturado (con IVA)", data.ingresos.totalFacturado],
    ["RENTA BRUTA", data.ingresos.rentaBruta, true],
  ]);

  y = sectionTitle(doc, y, "Rubro 2 — Egresos deducibles");
  y = amountRows(doc, y, [
    [`Compras al 10% deducibles (${pct(data.egresos.fraccionDeducible10)} de la base)`, data.egresos.deducible10],
    [`Compras al 5% deducibles (${pct(data.egresos.fraccionDeducible5)} de la base)`, data.egresos.deducible5],
    ["Compras exentas", data.egresos.deducibleExentas],
    ["Egresos NO deducibles (excluidos por la revisión ítem por ítem)", data.egresos.egresoNoDeducible],
    ["IVA de compras no deducible (va al costo)", data.egresos.ivaNoDeducible],
    ["TOTAL EGRESOS DEDUCIBLES", data.egresos.egresoDeducible, true],
  ]);

  y = sectionTitle(doc, y, "Liquidación");
  y = amountRows(doc, y, [
    ["Renta bruta", data.ingresos.rentaBruta],
    data.rules.deductsExpenses
      ? ["(-) Egresos deducibles", data.egresos.egresoDeducible]
      : ["(-) Egresos deducibles (este régimen no los deduce)", 0],
    ["RENTA NETA IMPONIBLE", data.rentaNetaImponible, true],
  ]);

  if (data.noIncidido) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333")
      .text(
        `Los ingresos brutos del ejercicio no superan ${money(
          data.rules.incidenceThreshold ?? 0
        )} Gs., por lo que no corresponde pagar el impuesto. Las obligaciones formales siguen vigentes.`,
        48,
        y,
        { width: doc.page.width - 96 }
      );
    y = doc.y + 10;
  } else if (data.bracketBreakdown.length > 0) {
    y = sectionTitle(doc, y, "Escala aplicada, tramo por tramo");
    y = amountRows(
      doc,
      y,
      data.bracketBreakdown.map(
        (slice) =>
          [
            `${money(slice.from)} – ${slice.to === null ? "en adelante" : money(slice.to)} · ` +
              `${pct(slice.rate)} sobre ${money(slice.base)}`,
            slice.tax,
          ] as [string, number]
      )
    );
  }

  y = amountRows(doc, y, [["IMPUESTO DETERMINADO", data.impuesto, true]]);

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#333")
    .text(
      `Documentos del ejercicio: ${data.documentCounts.ventas} comprobantes de venta aprobados, ` +
        `${data.documentCounts.compras} comprobantes de compra confirmados, ` +
        `en ${data.mesesConMovimiento.length} de 12 meses.`,
      40,
      y + 4,
      { width: doc.page.width - 80 }
    );

  disclaimer(
    doc,
    "Generado por FacturaPY sumando los doce meses del Libro IVA Ventas y del Libro IVA Compras. " +
      "La proporción deducible proviene de la revisión de deducibilidad del IVA hecha ítem por ítem, " +
      "que no es el mismo criterio legal que la deducibilidad del IRP: revisá los egresos antes de declarar. " +
      "La escala de tasas debe verificarse contra la norma vigente. Este documento no sustituye el " +
      "asesoramiento de un contador." +
      (mode === "mock" ? " MODO SIMULACIÓN: los datos pueden incluir documentos sin valor fiscal." : "")
  );

  doc.end();
  return done;
}
