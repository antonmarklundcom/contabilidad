/* Smoke test: full emit pipeline on a seeded draft. Run: npx tsx scripts/smoke-emit.ts */
import { prisma } from "@/lib/prisma";
import { emitInvoice, sendInvoiceToSifen } from "@/lib/dte";

async function main() {
  const draft = await prisma.invoice.findFirst({ where: { status: "DRAFT" } });
  if (!draft) throw new Error("no draft");
  const emitted = await emitInvoice(draft.id);
  console.log("emitted:", emitted.fullNumber, emitted.status, "cdc:", emitted.cdc);
  await sendInvoiceToSifen(draft.id);
  const after = await prisma.invoice.findUnique({ where: { id: draft.id } });
  console.log("after send:", after?.status, after?.sifenCodigoRespuesta, after?.sifenMensaje);
  console.log("kude:", after?.kudePath);
  const fs = await import("fs");
  console.log("kude exists:", after?.kudePath ? fs.existsSync(after.kudePath) : false, "size:", after?.kudePath ? fs.statSync(after.kudePath).size : 0);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e); process.exit(1); });
