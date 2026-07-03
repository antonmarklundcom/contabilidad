/**
 * Receipt OCR via the Anthropic API (vision + structured outputs).
 * Extracts Paraguayan invoice fields from a photo/PDF with per-field
 * confidence, then validates locally (RUC check digit, totals math,
 * date sanity). The model never invents totals — low confidence and
 * validation warnings are surfaced for human review.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { validarRuc } from "@/lib/sifen/ruc";

// The spec pins the extraction model; override with OCR_MODEL if needed.
const OCR_MODEL = process.env.OCR_MODEL || "claude-sonnet-4-6";

const confidence = () =>
  z
    .number()
    .describe("Confianza 0..1 de que el valor extraído es correcto");

export const receiptSchema = z.object({
  rucEmisor: z
    .string()
    .nullable()
    .describe("RUC del emisor SIN dígito verificador, solo números, ej: 80012345"),
  dvEmisor: z.string().nullable().describe("Dígito verificador del RUC (un dígito)"),
  razonSocial: z.string().nullable().describe("Razón social del emisor tal como aparece"),
  timbrado: z.string().nullable().describe("Número de timbrado (8 dígitos)"),
  tipoComprobante: z
    .string()
    .nullable()
    .describe("Tipo: FACTURA, FACTURA ELECTRONICA, TICKET, NOTA DE CREDITO, etc."),
  numeroComprobante: z
    .string()
    .nullable()
    .describe("Número del comprobante en formato xxx-xxx-xxxxxxx"),
  fecha: z.string().nullable().describe("Fecha de emisión en formato YYYY-MM-DD"),
  lineSummary: z
    .string()
    .nullable()
    .describe("Resumen corto de los ítems comprados (máx 200 caracteres)"),
  gravada10: z.number().nullable().describe("Subtotal gravado al 10% (base sin IVA... según como lo exprese el comprobante; si el comprobante muestra 'Gravadas 10%' usá ese número)"),
  gravada5: z.number().nullable().describe("Subtotal gravado al 5%"),
  exenta: z.number().nullable().describe("Subtotal exento"),
  iva10: z.number().nullable().describe("IVA 10% (liquidación)"),
  iva5: z.number().nullable().describe("IVA 5% (liquidación)"),
  total: z.number().nullable().describe("Total de la operación"),
  moneda: z.enum(["PYG", "USD"]).nullable().describe("Moneda del comprobante"),
  confidences: z
    .object({
      rucEmisor: confidence(),
      razonSocial: confidence(),
      timbrado: confidence(),
      tipoComprobante: confidence(),
      numeroComprobante: confidence(),
      fecha: confidence(),
      gravada10: confidence(),
      gravada5: confidence(),
      exenta: confidence(),
      iva10: confidence(),
      iva5: confidence(),
      total: confidence(),
      moneda: confidence(),
    })
    .describe("Confianza por campo, 0..1"),
});

export type ReceiptExtraction = z.infer<typeof receiptSchema>;

export interface OcrResult {
  extraction: ReceiptExtraction;
  warnings: string[]; // machine-readable codes: ruc_invalid | totals_mismatch | date_odd
  raw: unknown;
}

const SYSTEM_PROMPT = `Sos un extractor de datos de comprobantes fiscales de Paraguay (facturas, tickets, notas de crédito).
Extraé EXACTAMENTE lo que aparece en la imagen o PDF — nunca inventes ni calcules valores que no estén impresos.
Si un campo no se ve o no existe, devolvé null y confianza baja.
Los montos en guaraníes no llevan decimales. El número de comprobante tiene el formato xxx-xxx-xxxxxxx.
El RUC paraguayo tiene hasta 8 dígitos más un dígito verificador después del guión.
Respondé únicamente con el JSON pedido.`;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractReceipt(
  file: Buffer,
  mimeType: string
): Promise<OcrResult> {
  if (!anthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  const client = new Anthropic();

  const data = file.toString("base64");
  const mediaBlock =
    mimeType === "application/pdf"
      ? ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data },
        } as const)
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data,
          },
        } as const);

  const response = await client.messages.parse({
    model: OCR_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          mediaBlock,
          {
            type: "text",
            text: "Extraé los datos de este comprobante paraguayo con la confianza por campo.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(receiptSchema) },
  });

  const extraction = response.parsed_output;
  if (!extraction) {
    throw new Error("The model did not return a valid extraction");
  }

  return {
    extraction,
    warnings: validateExtraction(extraction),
    raw: extraction,
  };
}

/** Local validation — never trust the model's arithmetic. */
export function validateExtraction(e: ReceiptExtraction): string[] {
  const warnings: string[] = [];

  if (e.rucEmisor && e.dvEmisor && !validarRuc(e.rucEmisor, e.dvEmisor)) {
    warnings.push("ruc_invalid");
  }

  const parts =
    (e.gravada10 ?? 0) + (e.gravada5 ?? 0) + (e.exenta ?? 0) + (e.iva10 ?? 0) + (e.iva5 ?? 0);
  if (e.total !== null && parts > 0) {
    const diff = Math.abs(parts - e.total);
    // Tolerate rounding: 1 unit per component for PYG, 0.05 for USD.
    const tolerance = e.moneda === "USD" ? 0.06 : 5;
    if (diff > tolerance) warnings.push("totals_mismatch");
  }

  if (e.fecha) {
    const d = new Date(e.fecha);
    const now = new Date();
    const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
    const inAMonth = new Date(now.getTime() + 31 * 24 * 3600 * 1000);
    if (Number.isNaN(d.getTime()) || d < tenYearsAgo || d > inAMonth) {
      warnings.push("date_odd");
    }
  }

  return warnings;
}
