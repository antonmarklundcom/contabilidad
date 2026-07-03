/* Smoke test: mock adapter end-to-end with seeded data. Run: npx tsx scripts/smoke-sifen.ts */
import { prisma } from "@/lib/prisma";
import { getSifenAdapterForCompany, buildInvoiceData } from "@/lib/sifen";
import { randomSecurityCode } from "@/lib/sifen/cdc";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";

async function main() {
  const { adapter, config } = await getSifenAdapterForCompany();
  const invoice = await prisma.invoice.findFirst({
    where: { status: "APPROVED" },
    include: { lines: true, client: true, originalInvoice: true },
  });
  if (!invoice) throw new Error("no invoice");
  if (!invoice.securityCode) invoice.securityCode = randomSecurityCode();
  const data = buildInvoiceData(invoice);
  const xml = await adapter.generateXml(data, config);
  console.log("XML OK, length:", xml.length);
  const cdcMatch = xml.match(/Id="(\d{44})"/);
  console.log("CDC in XML:", cdcMatch?.[1]);
  const signed = await adapter.signXml(xml);
  console.log("Signed OK:", signed.includes("Signature"));
  const resp = await adapter.send(signed);
  console.log("Send:", resp.estado, resp.code, resp.message);
  const qr = await adapter.generateQr(signed);
  console.log("QR:", qr.slice(0, 100));
  const ruc = await adapter.queryRuc("80011111-" + calcularDigitoVerificador("80011111"));
  console.log("RUC query:", ruc.razonSocial, ruc.estado);
  const cancel = await adapter.cancelDocument(cdcMatch![1], "Prueba de cancelación");
  console.log("Cancel:", cancel.estado, cancel.code, cancel.message);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
