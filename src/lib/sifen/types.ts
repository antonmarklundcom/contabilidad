/**
 * SIFEN adapter contract. Every SIFEN interaction in the app goes through
 * a SifenAdapter implementation — MockSifenAdapter (no certificate) or
 * RealSifenAdapter (test/production endpoints, .p12 certificate).
 */

export type SifenMode = "mock" | "test" | "production";

/** Static issuer data — maps 1:1 to the xmlgen `params` JSON. */
export interface CompanyConfig {
  version: number; // Manual Técnico version, 150
  /** Our own Company.id — the adapter needs it to load that tenant's cert. */
  companyId?: string;
  ruc: string; // "80000000-5" (with DV)
  razonSocial: string;
  nombreFantasia?: string;
  actividadesEconomicas: { codigo: string; descripcion: string }[];
  timbradoNumero: string;
  timbradoFecha: string; // "2025-01-31"
  tipoContribuyente: number; // 1 física, 2 jurídica
  tipoRegimen?: number;
  establecimientos: {
    codigo: string;
    denominacion?: string;
    direccion: string;
    numeroCasa: string;
    complementoDireccion1?: string;
    complementoDireccion2?: string;
    departamento: number;
    departamentoDescripcion: string;
    distrito: number;
    distritoDescripcion: string;
    ciudad: number;
    ciudadDescripcion: string;
    telefono?: string;
    email?: string;
  }[];
}

/** Variable per-document data — maps 1:1 to the xmlgen `data` JSON. */
export type InvoiceData = Record<string, unknown>;

export type SifenEstado = "Aprobado" | "Rechazado" | "Pendiente" | "Desconocido";

export interface SifenResponse {
  success: boolean;
  estado: SifenEstado;
  /** dCodRes — SIFEN response code, e.g. "0260" (approved). */
  code?: string;
  /** dMsgRes — human message from SIFEN. */
  message?: string;
  /** Número de protocolo/transacción when available. */
  protocol?: string;
  cdc?: string;
  /** Raw response XML/JSON for the sifen_log table. */
  raw?: string;
}

export interface SifenStatus {
  cdc: string;
  estado: SifenEstado;
  code?: string;
  message?: string;
  raw?: string;
}

export interface RucInfo {
  ruc: string; // without DV
  dv: string;
  razonSocial: string;
  /** dCodEstCon: ACTIVO | SUSPENSION TEMPORAL | CANCELADO … */
  estado: string;
  /** True when the RUC is a facturador electrónico. */
  facturadorElectronico?: boolean;
  raw?: string;
}

export interface SifenAdapter {
  readonly mode: SifenMode;
  /** Builds the DE XML via facturacionelectronicapy-xmlgen (real in ALL modes). */
  generateXml(invoice: InvoiceData, company: CompanyConfig): Promise<string>;
  /** Signs the XML with the .p12 (mock: fake signature block). */
  signXml(xml: string): Promise<string>;
  /** Sends the signed XML to SIFEN (recibe). */
  send(signedXml: string): Promise<SifenResponse>;
  /** Queries the status of a CDC (consulta). */
  queryStatus(cdc: string): Promise<SifenStatus>;
  /** Queries a RUC (consultaRUC). */
  queryRuc(ruc: string): Promise<RucInfo>;
  /** Cancels a document via evento de cancelación (48h window enforced by caller). */
  cancelDocument(cdc: string, reason: string): Promise<SifenResponse>;
  /** Builds the QR content/URL for the KuDE from the signed XML. */
  generateQr(signedXml: string): Promise<string>;
}
