import { describe, it, expect } from "vitest";
import { calcularDigitoVerificador, validarRuc, splitRuc } from "@/lib/sifen/ruc";
import constants from "facturacionelectronicapy-xmlgen/dist/services/jsonDteAlgoritmos.service";

describe("RUC check digit (módulo 11)", () => {
  it("matches the xmlgen library implementation for a range of RUCs", () => {
    for (const ruc of ["80000000", "80069563", "2005001", "3333333", "1", "99999999"]) {
      expect(calcularDigitoVerificador(ruc)).toBe(
        constants.calcularDigitoVerificador(ruc)
      );
    }
  });

  it("handles RUCs with letters via ASCII substitution like the library", () => {
    for (const ruc of ["80012A45", "12B", "C99"]) {
      expect(calcularDigitoVerificador(ruc)).toBe(
        constants.calcularDigitoVerificador(ruc)
      );
    }
  });

  it("validarRuc accepts a correct DV and rejects a wrong one", () => {
    const dv = calcularDigitoVerificador("80069563");
    expect(validarRuc("80069563", dv)).toBe(true);
    expect(validarRuc("80069563", (dv + 1) % 10)).toBe(false);
  });

  it("validarRuc rejects malformed input", () => {
    expect(validarRuc("", 0)).toBe(false);
    expect(validarRuc("abc", 1)).toBe(false);
    expect(validarRuc("123456789", 0)).toBe(false); // 9 digits
  });

  it("splitRuc parses both hyphenated and joined forms", () => {
    expect(splitRuc("80012345-6")).toEqual({ ruc: "80012345", dv: "6" });
    expect(splitRuc("800123456")).toEqual({ ruc: "80012345", dv: "6" });
    expect(splitRuc("not-a-ruc")).toBeNull();
  });
});
