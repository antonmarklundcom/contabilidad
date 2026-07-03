import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { InvoiceForm } from "../invoice-form";
import { loadInvoiceFormData } from "../form-data";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const data = await loadInvoiceFormData(locale);

  return (
    <div>
      <PageHeader title={t("invoices.new")} />
      <InvoiceForm
        {...data}
        initial={params.clientId ? { clientId: params.clientId } : undefined}
      />
    </div>
  );
}
