import { sendInvoiceToSifen, queryInvoiceStatus, cancelInvoice, regenerateKude } from "@/lib/dte";
import { createBackup } from "@/lib/backup";
import { sendReminderEmail, type ReminderKind } from "@/lib/notifications";
import { sendCloseReport } from "@/lib/tax/monthly-report";

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
    case "filing_reminder":
      await sendReminderEmail({
        companyId: String(payload.companyId),
        kind: String(payload.kind) as ReminderKind,
        dueDate: String(payload.dueDate),
        detail: String(payload.detail ?? ""),
      });
      return;
    case "send_report":
      await sendCloseReport({
        companyId: String(payload.companyId),
        year: Number(payload.year),
        month: Number(payload.month),
      });
      return;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}
