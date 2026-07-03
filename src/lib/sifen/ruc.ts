/**
 * Paraguayan RUC check-digit (dígito verificador) — módulo 11, baseMax 11.
 * Mirrors the algorithm used by SIFEN / facturacionelectronicapy-xmlgen
 * (jsonDteAlgoritmos.calcularDigitoVerificador) so both always agree.
 */
export function calcularDigitoVerificador(input: string, baseMax = 11): number {
  // Non-digit characters are replaced by their ASCII code (legacy RUCs with letters).
  let numeric = "";
  for (const ch of input.toUpperCase()) {
    const code = ch.charCodeAt(0);
    numeric += code >= 48 && code <= 57 ? ch : String(code);
  }

  let k = 2;
  let total = 0;
  for (let i = numeric.length; i > 0; i--) {
    if (k > baseMax) k = 2;
    total += parseInt(numeric.substring(i - 1, i), 10) * k;
    k += 1;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

/** Returns true when `dv` is the correct check digit for `ruc` (digits only, no DV). */
export function validarRuc(ruc: string, dv: string | number): boolean {
  const clean = ruc.trim();
  if (!/^[0-9]{1,8}$/.test(clean)) return false;
  const dvNum = typeof dv === "string" ? parseInt(dv.trim(), 10) : dv;
  if (Number.isNaN(dvNum)) return false;
  return calcularDigitoVerificador(clean) === dvNum;
}

/** Splits "80012345-6" into { ruc, dv } or returns null when malformed. */
export function splitRuc(full: string): { ruc: string; dv: string } | null {
  const m = full.trim().match(/^([0-9]{1,8})-?([0-9])$/);
  if (!m) return null;
  return { ruc: m[1], dv: m[2] };
}

/** Formats ruc + dv as "80012345-6". */
export function formatRuc(ruc: string, dv: string | number): string {
  return `${ruc}-${dv}`;
}
