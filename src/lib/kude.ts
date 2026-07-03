/**
 * KuDE (Kuatia'i Documento Electrónico) PDF — the printable representation
 * of the DTE, generated with pdfkit once SIFEN approves the document
 * (and also for contingency, marked accordingly).
 */
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Company } from "@prisma/client";
import type { InvoiceWithRelations } from "@/lib/sifen/mapping";
import { formatRuc } from "@/lib/sifen/ruc";

const DOC_NAMES: Record<number, string> = {
  1: "FACTURA ELECTRÓNICA",
  4: "AUTOFACTURA ELECTRÓNICA",
  5: "NOTA DE CRÉDITO ELECTRÓNICA",
  6: "NOTA DE DÉBITO ELECTRÓNICA",
  7: "NOTA DE REMISIÓN ELECTRÓNICA",
};

const money = (v: number | string | { toString(): string }, currency: string) => {
  const n = Number(v);
  const digits = currency === "PYG" ? 0 : 2;
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
};

const fdate = (d: Date) =>
  new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export async function generateKudePdf(
  invoice: InvoiceWithRelations,
  company: Company,
  qrText: string | null,
  mode: string
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  const W = doc.page.width - 72; // usable width
  const L = 36;
  const currency = invoice.moneda;

  // ── Header ────────────────────────────────────────────────────────────
  doc.roundedRect(L, 36, W, 92, 4).stroke("#999");
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(12);
  doc.text(company.razonSocial, L + 10, 46, { width: W * 0.55 });
  doc.font("Helvetica").fontSize(8).fillColor("#333");
  doc.text(
    [
      company.nombreFantasia,
      `${company.direccion} ${company.numeroCasa !== "0" ? "N° " + company.numeroCasa : ""}`.trim(),
      `${company.ciudadDescripcion} — ${company.departamentoDescripcion}`,
      [company.telefono && `Tel: ${company.telefono}`, company.email].filter(Boolean).join("  ·  "),
    ]
      .filter(Boolean)
      .join("\n"),
    L + 10,
    62,
    { width: W * 0.55 }
  );

  const rx = L + W * 0.58;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");
  doc.text(`RUC: ${formatRuc(company.ruc, company.dv)}`, rx, 46, { width: W * 0.42 - 10 });
  doc.font("Helvetica").fontSize(8);
  doc.text(`Timbrado N°: ${company.timbradoNumero}`, rx, 58);
  doc.text(`Inicio de vigencia: ${fdate(company.timbradoFechaInicio)}`, rx, 68);
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text(DOC_NAMES[invoice.tipoDocumento] ?? "DOCUMENTO ELECTRÓNICO", rx, 82);
  doc.fontSize(11).text(invoice.fullNumber ?? "—", rx, 96);

  // ── Operation data ────────────────────────────────────────────────────
  let y = 140;
  doc.roundedRect(L, y, W, 58, 4).stroke("#999");
  const c = invoice.client;
  const clientDoc =
    c.docType === "RUC" && c.ruc
      ? `RUC: ${formatRuc(c.ruc, c.dv ?? "")}`
      : c.docType === "CI"
        ? `CI: ${c.documentoNumero ?? ""}`
        : c.docType === "PASAPORTE"
          ? `Pasaporte: ${c.documentoNumero ?? ""}`
          : "Innominado";
  doc.font("Helvetica").fontSize(8).fillColor("#333");
  const rows: [string, string][] = [
    ["Fecha de emisión", fdate(invoice.issueDate)],
    ["Razón social", c.razonSocial],
    ["Documento", clientDoc],
    [
      "Condición de venta",
      invoice.condicionVenta === 2
        ? `Crédito${invoice.creditPlazo ? " — " + invoice.creditPlazo : ""}`
        : "Contado",
    ],
    ["Moneda", currency + (invoice.exchangeRate ? `  (TC: ${money(invoice.exchangeRate, "USD")})` : "")],
  ];
  let ry = y + 8;
  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").text(`${label}: `, L + 10, ry, { continued: true, width: W - 20 });
    doc.font("Helvetica").text(value);
    ry = doc.y + 1;
  }

  // ── Lines table ───────────────────────────────────────────────────────
  y = 212;
  const cols = [
    { label: "Cód.", w: 0.08, align: "left" as const },
    { label: "Descripción", w: 0.34, align: "left" as const },
    { label: "Cant.", w: 0.07, align: "right" as const },
    { label: "Precio unit.", w: 0.11, align: "right" as const },
    { label: "Exentas", w: 0.12, align: "right" as const },
    { label: "Grav. 5%", w: 0.13, align: "right" as const },
    { label: "Grav. 10%", w: 0.15, align: "right" as const },
  ];
  doc.rect(L, y, W, 16).fill("#eee");
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(7.5);
  let x = L;
  for (const col of cols) {
    doc.text(col.label, x + 3, y + 4.5, { width: W * col.w - 6, align: col.align });
    x += W * col.w;
  }
  y += 16;
  doc.font("Helvetica").fontSize(7.5).fillColor("#222");
  const sorted = invoice.lines.slice().sort((a, b) => a.orden - b.orden);
  for (const line of sorted) {
    const qty = Number(line.cantidad);
    const price = Number(line.precioUnitario) - Number(line.descuento);
    const lineTotal = Math.round(qty * price * (currency === "PYG" ? 1 : 100)) / (currency === "PYG" ? 1 : 100);
    const cells = [
      line.codigo ?? "",
      line.descripcion,
      money(qty, "USD").replace(/,00$/, ""),
      money(price, currency),
      line.iva === 0 ? money(lineTotal, currency) : "0",
      line.iva === 5 ? money(lineTotal, currency) : "0",
      line.iva === 10 ? money(lineTotal, currency) : "0",
    ];
    const rowH = Math.max(
      14,
      doc.heightOfString(line.codigo ?? "", { width: W * cols[0].w - 6 }) + 6,
      doc.heightOfString(line.descripcion, { width: W * cols[1].w - 6 }) + 6
    );
    if (y + rowH > doc.page.height - 220) {
      doc.addPage();
      y = 36;
    }
    x = L;
    cells.forEach((cell, i) => {
      doc.text(cell, x + 3, y + 3, { width: W * cols[i].w - 6, align: cols[i].align });
      x += W * cols[i].w;
    });
    doc.moveTo(L, y + rowH).lineTo(L + W, y + rowH).stroke("#ddd");
    y += rowH;
  }

  // ── Totals ────────────────────────────────────────────────────────────
  y += 8;
  const totals: [string, string][] = [
    ["Subtotal exentas", money(invoice.totalExenta, currency)],
    ["Subtotal gravadas 5%", money(invoice.totalGravada5, currency)],
    ["Subtotal gravadas 10%", money(invoice.totalGravada10, currency)],
    ["TOTAL DE LA OPERACIÓN", money(invoice.total, currency)],
    ["Liquidación IVA 5%", money(invoice.totalIva5, currency)],
    ["Liquidación IVA 10%", money(invoice.totalIva10, currency)],
    ["TOTAL IVA", money(invoice.totalIva, currency)],
  ];
  doc.fontSize(8);
  for (const [label, value] of totals) {
    const bold = label.startsWith("TOTAL");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    doc.text(label, L + W * 0.45, y, { width: W * 0.33, align: "right" });
    doc.text(value, L + W * 0.79, y, { width: W * 0.21 - 6, align: "right" });
    y += 12;
  }

  // ── QR + CDC footer ───────────────────────────────────────────────────
  y += 10;
  if (y > doc.page.height - 190) {
    doc.addPage();
    y = 36;
  }
  doc.roundedRect(L, y, W, 128, 4).stroke("#999");
  if (qrText) {
    const png = await QRCode.toBuffer(qrText, { margin: 0, width: 100 });
    doc.image(png, L + 12, y + 14, { width: 100, height: 100 });
  }
  const tx = L + 128;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111");
  doc.text("Consulte la validez de este Documento Electrónico con el número de CDC en:", tx, y + 14, {
    width: W - 140,
  });
  doc.font("Helvetica").fontSize(8).fillColor("#333");
  doc.text(
    mode === "production"
      ? "https://ekuatia.set.gov.py/consultas/"
      : "https://ekuatia.set.gov.py/consultas-test/",
    tx,
    doc.y + 2
  );
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("CDC:", tx, doc.y + 8);
  doc
    .font("Courier")
    .fontSize(8.5)
    .text(formatCdc(invoice.cdc), tx, doc.y + 1, { width: W - 140 });
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#555")
    .text(
      "ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML). " +
        "Si su documento electrónico presenta algún error, podrá solicitar la modificación dentro de las 72 horas siguientes de la emisión de este comprobante.",
      tx,
      doc.y + 8,
      { width: W - 140 }
    );

  // ── Mock watermark ────────────────────────────────────────────────────
  if (mode === "mock") {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.save();
      doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc
        .font("Helvetica-Bold")
        .fontSize(42)
        .fillColor("#d33")
        .opacity(0.16)
        .text("SIN VALOR FISCAL — SIMULACIÓN", 0, doc.page.height / 2 - 24, {
          width: doc.page.width,
          align: "center",
        });
      doc.opacity(1).restore();
    }
  }

  doc.end();
  return done;
}

function formatCdc(cdc: string | null): string {
  if (!cdc) return "—";
  return cdc.replace(/(.{4})/g, "$1 ").trim();
}
