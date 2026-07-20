import { sendInvoiceToSifen, queryInvoiceStatus, cancelInvoice, regenerateKude } from "@/lib/dte";
import { createBackup } from "@/lib/backup";
import { sendCloseReport, sendDeclarationReminder } from "@/lib/tax-close";

export async function runJobHandler(
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (type) {
    case "send_dte":
      await sendInvoiceToSifen(String(payload.invoiceId));
      return;
    case "query_status":
      await queryInvoiceStatus(String(payload.invoiceId));
      return;
    case "generate_kude":
      await regenerateKude(String(payload.invoiceId));
      return;
    case "cancel_dte":
      await cancelInvoice(String(payload.invoiceId), String(payload.reason ?? ""));
      return;
    case "backup":
      await createBackup();
      return;
    case "send_report":
      await sendCloseReport(String(payload.companyId), Number(payload.year), Number(payload.month));
      return;
    case "declaration_reminder":
      await sendDeclarationReminder(
        String(payload.companyId),
        Number(payload.year),
        Number(payload.month)
      );
      return;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}
