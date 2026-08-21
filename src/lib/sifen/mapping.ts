/**
 * Maps our Prisma domain objects to the JSON structures expected by
 * facturacionelectronicapy-xmlgen (params = issuer, data = document).
 * Field names come from the xmlgen README (Manual Técnico 150) — do not
 * invent new ones here.
 */
import type { Company, Establishment, Client, Invoice, InvoiceLine } from "@prisma/client";
import type { CompanyConfig, InvoiceData } from "./types";
import { formatRuc } from "./ruc";

export const SIFEN_VERSION = 150;

export function buildCompanyConfig(
  company: Company,
  establishments: Establishment[]
): CompanyConfig {
  return {
    version: SIFEN_VERSION,
    companyId: company.id,
    ruc: formatRuc(company.ruc, company.dv),
    razonSocial: company.razonSocial,
    nombreFantasia: company.nombreFantasia ?? undefined,
    actividadesEconomicas: (company.actividades as { codigo: string; descripcion: string }[]) ?? [],
    timbradoNumero: company.timbradoNumero,
    timbradoFecha: toDateString(company.timbradoFechaInicio),
    tipoContribuyente: company.tipoContribuyente,
    tipoRegimen: company.tipoRegimen ?? undefined,
    establecimientos: establishments.map((e) => ({
      codigo: e.codigo,
      denominacion: e.denominacion ?? undefined,
      direccion: e.direccion || company.direccion,
      numeroCasa: e.numeroCasa || company.numeroCasa || "0",
      complementoDireccion1: e.complementoDireccion1 ?? undefined,
      complementoDireccion2: e.complementoDireccion2 ?? undefined,
      departamento: e.departamento ?? company.departamento,
      departamentoDescripcion: e.departamentoDescripcion ?? company.departamentoDescripcion,
      distrito: e.distrito ?? company.distrito,
      distritoDescripcion: e.distritoDescripcion ?? company.distritoDescripcion,
      ciudad: e.ciudad ?? company.ciudad,
      ciudadDescripcion: e.ciudadDescripcion ?? company.ciudadDescripcion,
      telefono: e.telefono ?? company.telefono ?? undefined,
      email: e.email ?? company.email ?? undefined,
    })),
  };
}

export type InvoiceWithRelations = Invoice & {
  lines: InvoiceLine[];
  client: Client;
  originalInvoice?: Invoice | null;
};

/** SIFEN receiver document types (tiposDocumentosReceptor). */
const DOC_TYPE_CODES: Record<string, number> = {
  CI: 1,
  PASAPORTE: 2,
  INNOMINADO: 5,
};

export function buildInvoiceData(invoice: InvoiceWithRelations): InvoiceData {
  const c = invoice.client;
  const isContribuyente = c.docType === "RUC" && !!c.ruc;
  const currency = invoice.moneda;

  const cliente: Record<string, unknown> = {
    contribuyente: isContribuyente,
    razonSocial: c.razonSocial,
    nombreFantasia: c.nombreFantasia ?? c.razonSocial,
    // 1=B2B, 2=B2C, 3=B2G, 4=B2F
    tipoOperacion: isContribuyente ? 1 : 2,
    pais: c.pais,
    paisDescripcion: c.paisDescripcion,
    // NOTE: cliente.direccion is intentionally omitted — when present, SIFEN
    // requires numeroCasa + departamento/distrito/ciudad codes for the
    // receiver, which we don't collect. The address stays in our DB only.
    telefono: c.telefono ?? undefined,
    email: c.email ?? undefined,
    codigo: c.id.slice(-6),
  };
  if (isContribuyente) {
    cliente.ruc = formatRuc(c.ruc!, c.dv ?? "0");
    cliente.tipoContribuyente = c.tipoContribuyente ?? 1;
  } else {
    cliente.documentoTipo = DOC_TYPE_CODES[c.docType] ?? 1;
    cliente.documentoNumero =
      c.docType === "INNOMINADO" ? "0" : (c.documentoNumero ?? "0");
  }

  const items = invoice.lines
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((l) => ({
      codigo: l.codigo || l.id.slice(-8),
      descripcion: l.descripcion,
      unidadMedida: l.unidadMedida,
      cantidad: Number(l.cantidad),
      precioUnitario: Number(l.precioUnitario),
      descuento: Number(l.descuento) || 0,
      ivaTipo: l.ivaTipo, // 1=Gravado IVA, 3=Exento, 4=Gravado parcial
      // SIFEN: exento (ivaTipo 3) must carry ivaProporcion 0.
      ivaProporcion: l.ivaTipo === 3 ? 0 : l.ivaProporcion,
      iva: l.iva,
    }));

  const data: InvoiceData = {
    tipoDocumento: invoice.tipoDocumento,
    establecimiento: invoice.establecimiento,
    punto: invoice.punto,
    numero: invoice.numero,
    codigoSeguridadAleatorio: invoice.securityCode,
    fecha: toDateTimeString(invoice.issueDate),
    // 1=Normal, 2=Contingencia
    tipoEmision: invoice.status === "CONTINGENCY" ? 2 : 1,
    tipoTransaccion: invoice.tipoTransaccion,
    // 1=IVA
    tipoImpuesto: 1,
    moneda: currency,
    descripcion: invoice.descripcion ?? undefined,
    observacion: invoice.observacion ?? undefined,
    cliente,
    items,
    condicion: buildCondicion(invoice),
  };

  if (currency !== "PYG") {
    data.condicionTipoCambio = 1; // global exchange rate
    data.cambio = Number(invoice.exchangeRate ?? 0);
  }

  if (invoice.tipoDocumento === 1) {
    // 1=Operación presencial
    data.factura = { presencia: 1 };
  }

  if (
    (invoice.tipoDocumento === 5 || invoice.tipoDocumento === 6) &&
    invoice.originalInvoice?.cdc
  ) {
    data.notaCreditoDebito = { motivo: invoice.motivoNota ?? 1 };
    data.documentoAsociado = {
      formato: 1, // electrónico
      cdc: invoice.originalInvoice.cdc,
    };
  }

  return data;
}

function buildCondicion(invoice: InvoiceWithRelations): Record<string, unknown> {
  if (invoice.condicionVenta === 2) {
    return {
      tipo: 2,
      credito: {
        tipo: 1, // plazo
        plazo: invoice.creditPlazo ?? "30 días",
        ...(invoice.creditCuotas ? { cuotas: invoice.creditCuotas } : {}),
      },
    };
  }
  return {
    tipo: 1,
    entregas: [
      {
        tipo: 1, // efectivo
        monto: String(Number(invoice.total)),
        moneda: invoice.moneda,
        cambio: invoice.moneda !== "PYG" ? Number(invoice.exchangeRate ?? 0) : 0,
      },
    ],
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDateTimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
