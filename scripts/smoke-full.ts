/* Full end-to-end mock verification. */
import { prisma } from "@/lib/prisma";
import { emitInvoice, sendInvoiceToSifen } from "@/lib/dte";
import { libroVentas, libroCompras, dashboardData } from "@/lib/accounting";
import { getCompanyId } from "@/lib/company";
import fs from "fs";

async function main() {
  const companyId = await getCompanyId();
  const draft = await prisma.invoice.findFirst({ where: { status: "DRAFT" } });
  if (!draft) throw new Error("no draft to emit");
  const emitted = await emitInvoice(draft.id);
  await sendInvoiceToSifen(draft.id);
  const after = await prisma.invoice.findUnique({ where: { id: draft.id } });
  console.log("EMIT:", emitted.fullNumber, "→", after?.status, after?.sifenCodigoRespuesta);
  console.log("KuDE exists:", after?.kudePath ? fs.existsSync(after.kudePath) : false);
  console.log("XML signed exists:", after?.signedXmlPath ? fs.existsSync(after.signedXmlPath) : false);

  const now = new Date();
  const v = await libroVentas(companyId, now.getFullYear(), now.getMonth() + 1);
  const c = await libroCompras(companyId, now.getFullYear(), now.getMonth() + 1);
  console.log("Libro Ventas rows:", v.rows.length, "total:", v.totals.total, "iva10:", v.totals.iva10);
  console.log("Libro Compras rows:", c.rows.length, "total:", c.totals.total);
  const d = await dashboardData(companyId, now.getFullYear(), now.getMonth() + 1);
  console.log("Dashboard IVA position:", d.ivaPosition, "pending:", d.pendingCount, "rejected:", d.rejectedCount);

  // Accounting identity on the emitted invoice
  const inv = after!;
  const identity = Number(inv.totalGravada10) + Number(inv.totalIva10) + Number(inv.totalGravada5) + Number(inv.totalIva5) + Number(inv.totalExenta);
  console.log("Identity gravadas+iva+exenta == total:", identity === Number(inv.total), `(${identity} vs ${inv.total})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e); process.exit(1); });
