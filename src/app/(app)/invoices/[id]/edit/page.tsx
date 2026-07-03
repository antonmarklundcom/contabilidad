import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { InvoiceForm } from "../../invoice-form";
import { loadInvoiceFormData } from "../../form-data";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getT();
  const { id } = await params;
  const companyId = await getCompanyId();
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: { lines: { orderBy: { orden: "asc" } }, originalInvoice: true },
  });
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") redirect(`/invoices/${id}`);

  const data = await loadInvoiceFormData(locale);

  return (
    <div>
      <PageHeader title={`${t(`invoices.type_${invoice.tipoDocumento}`)} — ${t("status.DRAFT")}`} />
      <InvoiceForm
        {...data}
        initial={{
          id: invoice.id,
          clientId: invoice.clientId,
          tipoDocumento: invoice.tipoDocumento,
          establecimiento: invoice.establecimiento,
          punto: invoice.punto,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          moneda: invoice.moneda as "PYG" | "USD",
          exchangeRate: invoice.exchangeRate ? Number(invoice.exchangeRate) : undefined,
          condicionVenta: invoice.condicionVenta,
          creditPlazo: invoice.creditPlazo ?? undefined,
          creditCuotas: invoice.creditCuotas ?? undefined,
          descripcion: invoice.descripcion ?? undefined,
          observacion: invoice.observacion ?? undefined,
          originalInvoiceId: invoice.originalInvoiceId ?? undefined,
          originalLabel: invoice.originalInvoice?.fullNumber ?? undefined,
          motivoNota: invoice.motivoNota ?? undefined,
          lines: invoice.lines.map((l) => ({
            productId: l.productId ?? "",
            codigo: l.codigo ?? "",
            descripcion: l.descripcion,
            unidadMedida: l.unidadMedida,
            cantidad: Number(l.cantidad),
            precioUnitario: Number(l.precioUnitario),
            descuento: Number(l.descuento),
            iva: l.iva,
          })),
        }}
      />
    </div>
  );
}
