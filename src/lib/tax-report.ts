/**
 * Tax PDFs (pdfkit, like kude.ts):
 *  - Formulario 120 working draft: the month's IVA figures, laid out to be
 *    typed into the real F120 in Marangatu. Labeled "borrador de trabajo" —
 *    it is NOT the official form.
 *  - Informe mensual: the full month in one document (ventas, compras,
 *    deducibilidad, posición IVA, gastos por categoría).
 * Tax documents are Spanish-only, like the KuDE.
 */
import PDFDocument from "pdfkit";
import type { Company } from "@prisma/client";
import type { Form120Data } from "@/lib/form120";
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
    ["(−) Crédito fiscal", data.compras.creditoFiscal],
    ["(−) Saldo a favor del período anterior", data.saldoAnterior],
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
    ["Resultado operativo (ingresos − egresos)", f.ventas.total - f.compras.total, true],
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
