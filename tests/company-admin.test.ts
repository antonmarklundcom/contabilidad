import { describe, it, expect } from "vitest";
import { validateNewCompany, validateNewUser } from "@/lib/company-admin";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { can, routeCapability } from "@/lib/roles";

/** PLAN Phase 0.4b — onboarding a client company and its users. */
const ruc = "80012345";
const good = {
  ruc,
  dv: String(calcularDigitoVerificador(ruc)),
  razonSocial: "Cliente de prueba S.A.",
  timbradoNumero: "12345678",
  timbradoFechaInicio: "2026-01-01",
  direccion: "Calle 1",
  departamento: 11,
  distrito: 1,
  ciudad: 1,
};

describe("validateNewCompany", () => {
  it("accepts a complete company with a correct DV", () => {
    expect(validateNewCompany(good)).toBeNull();
  });

  it("recomputes the DV instead of trusting it", () => {
    const wrong = String((Number(good.dv) + 1) % 10);
    expect(validateNewCompany({ ...good, dv: wrong })).toBe("wrong_dv");
  });

  it("refuses malformed RUCs, missing names, timbrado and address", () => {
    expect(validateNewCompany({ ...good, ruc: "80A12345" })).toBe("invalid_ruc");
    expect(validateNewCompany({ ...good, razonSocial: "  " })).toBe("missing_razon_social");
    expect(validateNewCompany({ ...good, timbradoNumero: "123" })).toBe("missing_timbrado");
    expect(validateNewCompany({ ...good, timbradoFechaInicio: "" })).toBe("missing_timbrado");
    expect(validateNewCompany({ ...good, departamento: 0 })).toBe("missing_address");
  });
});

describe("validateNewUser", () => {
  const user = { email: "a@b.py", name: "Ana", role: "client", password: "x".repeat(10) };
  it("accepts a valid user", () => expect(validateNewUser(user)).toBeNull());
  it("refuses bad input", () => {
    expect(validateNewUser({ ...user, email: "nope" })).toBe("invalid_email");
    expect(validateNewUser({ ...user, name: "" })).toBe("missing_name");
    expect(validateNewUser({ ...user, role: "root" })).toBe("invalid_role");
    expect(validateNewUser({ ...user, password: "short" })).toBe("weak_password");
  });
});

describe("onboarding capabilities", () => {
  it("lets accountants create companies but only admins create logins", () => {
    expect(can("admin", "companies:create")).toBe(true);
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("accountant", "companies:create")).toBe(true);
    expect(can("accountant", "users:manage")).toBe(false);
    expect(can("client", "companies:create")).toBe(false);
    expect(can("client", "users:manage")).toBe(false);
  });

  it("gates the /companies pages", () => {
    expect(routeCapability("/companies")).toBe("companies:create");
    expect(routeCapability("/companies/new")).toBe("companies:create");
  });
});
