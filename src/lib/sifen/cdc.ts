import { calcularDigitoVerificador } from "./ruc";

/**
 * CDC (Código de Control) — 44 digits:
 * tipoDE(2) rucEmisor(8) dvEmisor(1) est(3) punto(3) numero(7)
 * tipoContribuyente(1) fechaAAAAMMDD(8) tipoEmision(1) codigoSeguridad(9) dv(1)
 */
export const CDC_LENGTH = 44;

export function isValidCdcFormat(cdc: string): boolean {
  if (!/^[0-9]{44}$/.test(cdc)) return false;
  const body = cdc.substring(0, 43);
  const dv = parseInt(cdc.substring(43), 10);
  return calcularDigitoVerificador(body) === dv;
}

export interface CdcParts {
  tipoDocumento: number;
  rucEmisor: string;
  dvEmisor: string;
  establecimiento: string;
  punto: string;
  numero: string;
  tipoContribuyente: number;
  fecha: string; // AAAAMMDD
  tipoEmision: number;
  codigoSeguridad: string;
  dv: string;
}

export function parseCdc(cdc: string): CdcParts | null {
  if (!/^[0-9]{44}$/.test(cdc)) return null;
  return {
    tipoDocumento: parseInt(cdc.slice(0, 2), 10),
    rucEmisor: cdc.slice(2, 10),
    dvEmisor: cdc.slice(10, 11),
    establecimiento: cdc.slice(11, 14),
    punto: cdc.slice(14, 17),
    numero: cdc.slice(17, 24),
    tipoContribuyente: parseInt(cdc.slice(24, 25), 10),
    fecha: cdc.slice(25, 33),
    tipoEmision: parseInt(cdc.slice(33, 34), 10),
    codigoSeguridad: cdc.slice(34, 43),
    dv: cdc.slice(43, 44),
  };
}

const leftZero = (v: string | number, len: number) => String(v).padStart(len, "0");

/**
 * Builds a CDC with the real SIFEN algorithm (same as
 * facturacionelectronicapy-xmlgen jsonDteAlgoritmos.generateCodigoControl).
 * Used by the mock adapter so mock CDCs are structurally real.
 */
export function buildCdc(opts: {
  tipoDocumento: number;
  ruc: string; // without DV
  dv: string;
  establecimiento: string;
  punto: string;
  numero: string;
  tipoContribuyente: number;
  fecha: Date;
  tipoEmision: number; // 1=Normal, 2=Contingencia
  codigoSeguridad: string; // 9 digits
}): string {
  const y = opts.fecha.getFullYear();
  const m = leftZero(opts.fecha.getMonth() + 1, 2);
  const d = leftZero(opts.fecha.getDate(), 2);
  const body =
    leftZero(opts.tipoDocumento, 2) +
    leftZero(opts.ruc, 8) +
    opts.dv +
    leftZero(opts.establecimiento, 3) +
    leftZero(opts.punto, 3) +
    leftZero(opts.numero, 7) +
    opts.tipoContribuyente +
    `${y}${m}${d}` +
    opts.tipoEmision +
    opts.codigoSeguridad;
  return body + calcularDigitoVerificador(body);
}

/** Random 9-digit security code (dCodSeg). Never all zeros. */
export function randomSecurityCode(): string {
  const n = Math.floor(Math.random() * 999999998) + 1;
  return String(n).padStart(9, "0");
}
