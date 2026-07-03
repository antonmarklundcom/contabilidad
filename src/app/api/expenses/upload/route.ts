import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { saveFile } from "@/lib/storage";
import { extractReceipt, anthropicConfigured } from "@/lib/ocr";
import { categoryForSupplier } from "@/app/(app)/expenses/actions";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import type { Prisma } from "@prisma/client";

export const maxDuration = 120;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

/**
 * Uploads one receipt file, runs OCR (if configured), and creates an
 * Expense in NEEDS_REVIEW. Returns the created expense id + extraction so
 * the client can open the review screen.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await getCompanyId();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = await saveFile("receipts", `${stamp}.${ext}`, buffer);
  const source = file.type === "application/pdf" ? "PDF" : "PHOTO";

  let extraction = null;
  let warnings: string[] = [];
  let ocrError: string | null = null;

  if (anthropicConfigured()) {
    try {
      const result = await extractReceipt(buffer, file.type);
      extraction = result.extraction;
      warnings = result.warnings;
    } catch (err) {
      ocrError = (err as Error).message;
    }
  }

  const e = extraction;
  const dv =
    e?.rucEmisor && !e.dvEmisor
      ? String(calcularDigitoVerificador(e.rucEmisor))
      : (e?.dvEmisor ?? null);

  const suggestedCategory = e?.rucEmisor ? await categoryForSupplier(e.rucEmisor) : null;

  const expense = await prisma.expense.create({
    data: {
      companyId,
      source,
      status: "NEEDS_REVIEW",
      supplierRuc: e?.rucEmisor ?? null,
      supplierDv: dv,
      supplierRazonSocial: e?.razonSocial ?? null,
      timbrado: e?.timbrado ?? null,
      tipoComprobante: e?.tipoComprobante ?? null,
      numeroComprobante: e?.numeroComprobante ?? null,
      fecha: e?.fecha ? new Date(e.fecha) : null,
      gravada10: e?.gravada10 ?? 0,
      gravada5: e?.gravada5 ?? 0,
      exenta: e?.exenta ?? 0,
      iva10: e?.iva10 ?? 0,
      iva5: e?.iva5 ?? 0,
      total: e?.total ?? 0,
      moneda: e?.moneda ?? "PYG",
      categoryId: suggestedCategory,
      filePath,
      fileMime: file.type,
      ocrRawJson: (extraction as Prisma.InputJsonValue) ?? undefined,
      confidence: (e?.confidences as Prisma.InputJsonValue) ?? undefined,
    },
  });

  return NextResponse.json({
    id: expense.id,
    ocrConfigured: anthropicConfigured(),
    ocrError,
    warnings,
  });
}
