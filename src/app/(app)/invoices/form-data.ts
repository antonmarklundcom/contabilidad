import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { notasCreditosMotivos } from "@/lib/sifen/catalogs";
import type { Locale } from "@/lib/i18n";
import type {
  ClientOption,
  ProductOption,
  PointOption,
  MotivoOption,
} from "./invoice-form";

/** Data every invoice form needs (new + edit). */
export async function loadInvoiceFormData(locale: Locale): Promise<{
  clients: ClientOption[];
  products: ProductOption[];
  points: PointOption[];
  motivos: MotivoOption[];
}> {
  const companyId = await getCompanyId();
  const [clients, products, points] = await Promise.all([
    prisma.client.findMany({
      where: { companyId },
      orderBy: { razonSocial: "asc" },
      take: 500,
    }),
    prisma.product.findMany({
      where: { companyId, active: true },
      orderBy: { codigo: "asc" },
      take: 500,
    }),
    prisma.expeditionPoint.findMany({
      where: { companyId },
      include: { establishment: true },
      orderBy: { codigo: "asc" },
    }),
  ]);
  return {
    clients: clients.map((c) => ({
      id: c.id,
      razonSocial: c.razonSocial,
      displayDoc:
        c.docType === "RUC" && c.ruc ? `${c.ruc}-${c.dv}` : (c.documentoNumero ?? c.docType),
      email: c.email,
    })),
    products: products.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      descripcion: locale === "en" && p.descripcionEn ? p.descripcionEn : p.descripcionEs,
      precioUnitario: Number(p.precioUnitario),
      moneda: p.moneda,
      iva: p.ivaRate === "IVA_10" ? 10 : p.ivaRate === "IVA_5" ? 5 : 0,
      unidadMedida: p.unidadMedida,
    })),
    points: points.map((p) => ({
      establecimiento: p.establishment.codigo,
      punto: p.codigo,
    })),
    motivos: notasCreditosMotivos.map((m) => ({
      codigo: Number(m.codigo),
      descripcion: m.descripcion,
    })),
  };
}
