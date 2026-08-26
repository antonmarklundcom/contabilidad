import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseDeXml,
  parseDeDate,
  isIssuedTo,
  supplierRucIsValid,
  type ParsedDe,
} from "@/lib/ekuatia-xml";

/**
 * e-Kuatiá DE XML import (PLAN Phase 3.1).
 *
 * Golden-file tests, like tests/marangatu-import.test.ts. The fixtures are
 * not hand-typed: `factura-10*.xml` and `factura-multirate.xml` were produced
 * by the REAL `facturacionelectronicapy-xmlgen` through our own emission
 * path, so the parser is tested against the generator rather than against an
 * idea of the format. The three remaining fixtures are those files edited to
 * be broken in exactly one way each.
 */
const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures/ekuatia", name), "utf8");

async function parse(name: string) {
  return parseDeXml(fixture(name));
}

describe("parseDeXml — a real generated DE", () => {
  it("reads the CDC off the DE's Id attribute", async () => {
    const r = await parse("factura-multirate.xml");
    expect(r.ok).toBe(true);
    expect(r.de!.cdc).toBe("01800695631001002000004222026051419917771880");
  });

  it("reads the issuer, the timbrado and the document number", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    expect(de.supplierRuc).toBe("80069563");
    expect(de.supplierDv).toBe("1");
    expect(de.supplierRazonSocial).toBe("PROVEEDOR EJEMPLO S.A.");
    expect(de.timbrado).toBe("16000123");
    expect(de.numeroComprobante).toBe("001-002-0000042");
    expect(de.tipoDocumento).toBe(1);
    expect(de.tipoComprobante).toBe("FACTURA");
    expect(supplierRucIsValid(de)).toBe(true);
  });

  it("takes the totals from the emitter's own gTotSub, per rate", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    // Exactly the block the generator wrote — never recomputed from items.
    expect(de.gravada10).toBe(1_000_000);
    expect(de.iva10).toBe(100_000);
    expect(de.gravada5).toBe(476_190);
    expect(de.iva5).toBe(23_810);
    expect(de.exenta).toBe(250_000);
    expect(de.total).toBe(1_850_000);
    expect(de.moneda).toBe("PYG");
  });

  it("keeps the totals internally consistent", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    expect(de.gravada10 + de.iva10 + de.gravada5 + de.iva5 + de.exenta).toBe(de.total);
  });

  it("reads every line with its IVA-included total and rate", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    expect(de.items).toHaveLength(3);
    expect(de.items[0]).toMatchObject({ descripcion: "Servicio gravado 10%", total: 1_100_000, tasa: 10 });
    expect(de.items[1]).toMatchObject({ descripcion: "Producto gravado 5%", total: 500_000, tasa: 5, cantidad: 2 });
    expect(de.items[2]).toMatchObject({ descripcion: "Item exento", total: 250_000, tasa: 0 });
    // Item totals are IVA-INCLUDED, which is what ExpenseItem expects.
    expect(de.items.reduce((s, i) => s + i.total, 0)).toBe(de.total);
  });

  it("dates the document by the calendar day it names, at UTC midnight", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    // Never shifted by the server's timezone: the libro's day is the one on
    // the document.
    expect(de.fecha.toISOString()).toBe("2026-05-14T00:00:00.000Z");
  });

  it("records who the document was issued to", async () => {
    const de = (await parse("factura-multirate.xml")).de!;
    expect(de.receptorRuc).toBe("80000000");
  });
});

describe("parseDeXml — the shapes people actually have on disk", () => {
  it("parses a bare rDE", async () => {
    expect((await parse("factura-10.xml")).ok).toBe(true);
  });

  it("parses a SIGNED rDE, ignoring the Signature sibling", async () => {
    const bare = (await parse("factura-10.xml")).de!;
    const signed = (await parse("factura-10-signed.xml")).de!;
    expect(signed).toEqual(bare);
  });

  it("finds the DE inside a response envelope", async () => {
    const loose = (await parse("factura-multirate.xml")).de!;
    const wrapped = (await parse("factura-en-lote.xml")).de!;
    expect(wrapped).toEqual(loose);
  });
});

describe("parseDeXml — what it refuses", () => {
  it("refuses something that is not XML", async () => {
    expect(await parseDeXml("this is not xml at all")).toMatchObject({
      ok: false,
      error: "not_xml",
    });
  });

  it("refuses XML with no DE in it", async () => {
    expect(await parseDeXml("<rDE><dVerFor>150</dVerFor></rDE>")).toMatchObject({
      ok: false,
      error: "no_de",
    });
  });

  it("refuses a DE with no Id attribute", async () => {
    expect(await parseDeXml("<rDE><DE><dDVId>5</dDVId></DE></rDE>")).toMatchObject({
      ok: false,
      error: "no_cdc",
    });
  });

  it("refuses a CDC whose check digit does not close", async () => {
    // A corrupted download: one digit off.
    expect(await parse("factura-cdc-invalido.xml")).toMatchObject({
      ok: false,
      error: "cdc_invalid",
    });
  });

  it("refuses a document whose body disagrees with its own CDC", async () => {
    // The document number was edited after the fact; the CDC still encodes
    // the original. Either corrupted or edited — a human should look before
    // this becomes a tax figure.
    const r = await parse("factura-cdc-alterada.xml");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("cdc_mismatch");
    // And it says exactly what disagreed, rather than just "invalid".
    const numero = r.findings.find((f) => f.code === "numero_mismatch");
    expect(numero?.values).toMatchObject({
      captured: "001-002-0000043",
      cdc: "001-002-0000042",
    });
  });

  it("refuses a DE missing the fields a libro entry needs", async () => {
    // A structurally valid CDC, but nothing else.
    const cdc = "01800695631001002000004222026051419917771880";
    expect(await parseDeXml(`<rDE><DE Id="${cdc}"><dDVId>0</dDVId></DE></rDE>`)).toMatchObject({
      ok: false,
      error: "missing_fields",
    });
  });
});

describe("isIssuedTo — booking someone else's purchase", () => {
  const de = (receptorRuc: string | null) => ({ receptorRuc }) as ParsedDe;

  it("accepts the company's own RUC, with or without the DV or padding", () => {
    expect(isIssuedTo(de("80000000"), "80000000-0")).toBe(true);
    expect(isIssuedTo(de("80000000"), "80000000")).toBe(true);
    expect(isIssuedTo(de("80000000"), "080000000-0")).toBe(true);
  });

  it("refuses a document issued to somebody else", () => {
    // The mistake this exists to prevent: a mixed-up batch of downloads
    // becoming your IVA credit.
    expect(isIssuedTo(de("80069563"), "80000000-0")).toBe(false);
  });

  it("allows a document with no receptor RUC rather than refusing everything", () => {
    // A consumidor final sale names no RUC; refusing the WRONG one is the
    // job, not refusing the absent one.
    expect(isIssuedTo(de(null), "80000000-0")).toBe(true);
  });
});

describe("parseDeDate", () => {
  it("reads the calendar day out of an ISO local datetime", () => {
    expect(parseDeDate("2026-05-14T10:17:54")?.toISOString()).toBe("2026-05-14T00:00:00.000Z");
    expect(parseDeDate("2026-05-14")?.toISOString()).toBe("2026-05-14T00:00:00.000Z");
  });

  it("returns null for anything it cannot read", () => {
    expect(parseDeDate(null)).toBeNull();
    expect(parseDeDate("")).toBeNull();
    expect(parseDeDate("14/05/2026")).toBeNull();
  });
});
