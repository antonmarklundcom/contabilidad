/**
 * SIFEN response-code dictionary (dCodRes).
 *
 * IMPORTANT: the UI always shows the verbatim message SIFEN returned
 * (invoice.sifenMensaje). The texts below are OUR OWN bilingual explanations
 * to help the user fix the problem — they are not official DNIT wording.
 * Exact entries cover well-known codes; range entries map the Manual
 * Técnico v150 validation-code ranges to the XML section being validated.
 * TODO(cert): during homologación, extend this list with the real codes SIFEN
 * returns for your documents (see README "WHEN THE CERTIFICATE ARRIVES").
 */

export interface SifenCodeInfo {
  es: string;
  en: string;
  /** Suggested fix, shown under the explanation. */
  fixEs?: string;
  fixEn?: string;
  kind: "approved" | "rejected" | "info";
}

const EXACT: Record<string, SifenCodeInfo> = {
  "0260": {
    es: "El documento fue aprobado por SIFEN.",
    en: "The document was approved by SIFEN.",
    kind: "approved",
  },
  "0261": {
    es: "El documento fue aprobado por SIFEN con observaciones.",
    en: "The document was approved by SIFEN with observations.",
    kind: "approved",
  },
  "0300": {
    es: "El lote fue recibido por SIFEN y está siendo procesado.",
    en: "The batch was received by SIFEN and is being processed.",
    kind: "info",
  },
  "0301": {
    es: "El lote todavía está en procesamiento; consultá de nuevo en unos minutos.",
    en: "The batch is still processing; query again in a few minutes.",
    kind: "info",
  },
  "0420": {
    es: "SIFEN rechazó el evento de cancelación (verificá el plazo de 48 horas y el estado del documento).",
    en: "SIFEN rejected the cancellation event (check the 48-hour window and the document status).",
    fixEs: "Solo se pueden cancelar documentos aprobados, dentro de las 48 horas de la emisión.",
    fixEn: "Only approved documents can be cancelled, within 48 hours of issuance.",
    kind: "rejected",
  },
  "0422": {
    es: "El CDC consultado no existe en SIFEN.",
    en: "The queried CDC does not exist in SIFEN.",
    fixEs: "Verificá que el documento haya sido enviado y aprobado.",
    fixEn: "Check that the document was actually sent and approved.",
    kind: "rejected",
  },
};

/** Manual Técnico v150 groups DE validation codes by XML section. */
const RANGES: { from: number; to: number; info: SifenCodeInfo }[] = [
  {
    from: 1000, to: 1099,
    info: {
      es: "Rechazo en la validación del encabezado del documento (tipo de documento, versión del formato).",
      en: "Rejected while validating the document header (document type, format version).",
      kind: "rejected",
    },
  },
  {
    from: 1100, to: 1199,
    info: {
      es: "Rechazo en los datos del timbrado o de la numeración (timbrado vencido/inexistente, establecimiento, punto o número inválido, numeración ya utilizada).",
      en: "Rejected on stamping (timbrado) or numbering data (expired/unknown timbrado, invalid establishment, expedition point or number, number already used).",
      fixEs: "Verificá el número de timbrado, su vigencia y la secuencia en Configuración.",
      fixEn: "Check the timbrado number, its validity window and the sequence in Settings.",
      kind: "rejected",
    },
  },
  {
    from: 1200, to: 1299,
    info: {
      es: "Rechazo en los datos de la operación (fecha de emisión fuera de rango, tipo de emisión o transacción inválidos).",
      en: "Rejected on operation data (issue date out of range, invalid emission or transaction type).",
      fixEs: "La fecha de emisión no puede diferir demasiado de la fecha de envío a SIFEN.",
      fixEn: "The issue date cannot differ too much from the date the document is sent to SIFEN.",
      kind: "rejected",
    },
  },
  {
    from: 1300, to: 1399,
    info: {
      es: "Rechazo en los datos del emisor (RUC del emisor inválido, no autorizado como facturador electrónico, actividad económica).",
      en: "Rejected on issuer data (invalid issuer RUC, not authorized as electronic biller, economic activity).",
      kind: "rejected",
    },
  },
  {
    from: 1400, to: 1499,
    info: {
      es: "Rechazo en los datos del receptor (RUC/CI del cliente inválido o inexistente en el padrón).",
      en: "Rejected on receiver data (client RUC/ID invalid or not present in the taxpayer registry).",
      fixEs: "Verificá el RUC del cliente con el botón «Consultar RUC en SIFEN».",
      fixEn: "Verify the client's RUC with the “Query RUC in SIFEN” button.",
      kind: "rejected",
    },
  },
  {
    from: 2000, to: 2999,
    info: {
      es: "Rechazo en los ítems o en los totales del documento (cálculo de IVA, sumas que no cierran, unidad de medida).",
      en: "Rejected on document items or totals (VAT math, sums that do not add up, unit of measure).",
      fixEs: "Revisá cantidades, precios, tipos de IVA y que gravadas + IVA + exentas = total.",
      fixEn: "Review quantities, prices, VAT types and that taxed + VAT + exempt = total.",
      kind: "rejected",
    },
  },
  {
    from: 3000, to: 3999,
    info: {
      es: "Rechazo en documentos asociados o eventos (nota de crédito/débito sin documento original válido, evento fuera de plazo).",
      en: "Rejected on associated documents or events (credit/debit note without a valid original document, event out of its time window).",
      kind: "rejected",
    },
  },
  {
    from: 4000, to: 4999,
    info: {
      es: "Rechazo por duplicidad: el CDC o la numeración ya fue utilizada en SIFEN.",
      en: "Rejected as duplicate: the CDC or the document number was already used in SIFEN.",
      fixEs: "Emití el documento con una nueva numeración (la secuencia avanza sola).",
      fixEn: "Issue the document with a new number (the sequence advances automatically).",
      kind: "rejected",
    },
  },
  {
    from: 5000, to: 5999,
    info: {
      es: "Rechazo en la firma digital o el certificado (firma inválida, certificado vencido/revocado o no corresponde al RUC emisor).",
      en: "Rejected on the digital signature or certificate (invalid signature, expired/revoked certificate or not matching the issuer RUC).",
      fixEs: "Verificá el certificado .p12 en Configuración y su fecha de vencimiento.",
      fixEn: "Check the .p12 certificate in Settings and its expiry date.",
      kind: "rejected",
    },
  },
  {
    from: 9000, to: 9999,
    info: {
      es: "Error del servicio de SIFEN o XML mal formado (no cumple el esquema XSD).",
      en: "SIFEN service error or malformed XML (does not match the XSD schema).",
      kind: "rejected",
    },
  },
];

export function explainSifenCode(code: string | null | undefined): SifenCodeInfo | null {
  if (!code) return null;
  if (EXACT[code]) return EXACT[code];
  const n = parseInt(code, 10);
  if (Number.isNaN(n)) return null;
  const range = RANGES.find((r) => n >= r.from && n <= r.to);
  return range?.info ?? null;
}

/** Realistic rejection samples used ONLY by the mock adapter. */
export const MOCK_REJECTIONS: { code: string; message: string }[] = [
  { code: "1101", message: "Simulación: timbrado inexistente o no vigente para el emisor" },
  { code: "1420", message: "Simulación: RUC del receptor inexistente en el padrón de SIFEN" },
  { code: "2560", message: "Simulación: los totales del documento no cierran (gravadas + IVA ≠ total)" },
  { code: "4001", message: "Simulación: CDC duplicado, el documento ya fue recibido por SIFEN" },
  { code: "5002", message: "Simulación: firma digital inválida o certificado no vigente" },
];
