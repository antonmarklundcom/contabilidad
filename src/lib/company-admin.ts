/**
 * Onboarding rules for new companies and users (PLAN Phase 0.4b).
 * Pure, so the refusals are tested without a database
 * (tests/company-admin.test.ts).
 */
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { ROLES, type Role } from "@/lib/roles";

export type NewCompanyError =
  | "invalid_ruc"
  | "wrong_dv"
  | "missing_razon_social"
  | "missing_timbrado"
  | "missing_address";

export function validateNewCompany(v: {
  ruc: string;
  dv: string;
  razonSocial: string;
  timbradoNumero: string;
  timbradoFechaInicio: string;
  direccion: string;
  departamento: number;
  distrito: number;
  ciudad: number;
}): NewCompanyError | null {
  if (!/^[0-9]{1,8}$/.test(v.ruc) || !/^[0-9]$/.test(v.dv)) return "invalid_ruc";
  // The DV is recomputed, never trusted: a typo in the RUC is the most common
  // onboarding mistake and SIFEN rejects every document it touches.
  if (String(calcularDigitoVerificador(v.ruc)) !== v.dv) return "wrong_dv";
  if (!v.razonSocial.trim()) return "missing_razon_social";
  if (!/^[0-9]{8}$/.test(v.timbradoNumero) || Number.isNaN(Date.parse(v.timbradoFechaInicio))) {
    return "missing_timbrado";
  }
  if (!v.direccion.trim() || v.departamento <= 0 || v.distrito <= 0 || v.ciudad <= 0) {
    return "missing_address";
  }
  return null;
}

export type NewUserError = "invalid_email" | "weak_password" | "invalid_role" | "missing_name";

export const MIN_PASSWORD_LENGTH = 10;

export function validateNewUser(v: {
  email: string;
  name: string;
  role: string;
  password: string;
}): NewUserError | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return "invalid_email";
  if (!v.name.trim()) return "missing_name";
  if (!(ROLES as readonly string[]).includes(v.role)) return "invalid_role";
  if (v.password.length < MIN_PASSWORD_LENGTH) return "weak_password";
  return null;
}

export type { Role };
