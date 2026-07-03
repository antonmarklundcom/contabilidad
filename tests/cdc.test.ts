import { describe, it, expect } from "vitest";
import { buildCdc, isValidCdcFormat, parseCdc, randomSecurityCode, CDC_LENGTH } from "@/lib/sifen/cdc";
import xmlgenAlgoritmos from "facturacionelectronicapy-xmlgen/dist/services/jsonDteAlgoritmos.service";

describe("CDC (44-digit control code)", () => {
  const opts = {
    tipoDocumento: 1,
    ruc: "80000000",
    dv: "0",
    establecimiento: "001",
    punto: "001",
    numero: "0000001",
    tipoContribuyente: 2,
    fecha: new Date("2026-05-19T10:00:00"),
    tipoEmision: 1,
    codigoSeguridad: "123456789",
  };

  it("produces a 44-digit CDC", () => {
    const cdc = buildCdc(opts);
    expect(cdc).toHaveLength(CDC_LENGTH);
    expect(/^[0-9]{44}$/.test(cdc)).toBe(true);
  });

  it("matches the xmlgen library's generateCodigoControl", () => {
    const cdc = buildCdc(opts);
    const params = { ruc: `${opts.ruc}-${opts.dv}`, tipoContribuyente: opts.tipoContribuyente };
    const data = {
      tipoDocumento: opts.tipoDocumento,
      establecimiento: opts.establecimiento,
      punto: opts.punto,
      numero: opts.numero,
      fecha: opts.fecha.toISOString(),
      tipoEmision: opts.tipoEmision,
    };
    const libCdc = xmlgenAlgoritmos.generateCodigoControl(params, data, opts.codigoSeguridad);
    expect(cdc).toBe(libCdc);
  });

  it("validates its own check digit", () => {
    const cdc = buildCdc(opts);
    expect(isValidCdcFormat(cdc)).toBe(true);
    // Corrupt the check digit → invalid
    const bad = cdc.slice(0, 43) + ((Number(cdc[43]) + 1) % 10);
    expect(isValidCdcFormat(bad)).toBe(false);
  });

  it("rejects non-44-digit strings", () => {
    expect(isValidCdcFormat("123")).toBe(false);
    expect(isValidCdcFormat("x".repeat(44))).toBe(false);
  });

  it("parses the CDC back into its parts", () => {
    const cdc = buildCdc(opts);
    const parts = parseCdc(cdc);
    expect(parts).not.toBeNull();
    expect(parts!.rucEmisor).toBe("80000000");
    expect(parts!.establecimiento).toBe("001");
    expect(parts!.numero).toBe("0000001");
    expect(parts!.fecha).toBe("20260519");
  });

  it("generates a 9-digit non-zero security code", () => {
    for (let i = 0; i < 50; i++) {
      const code = randomSecurityCode();
      expect(code).toHaveLength(9);
      expect(Number(code)).toBeGreaterThan(0);
    }
  });
});
