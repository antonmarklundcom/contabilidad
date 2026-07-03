/**
 * SIFEN adapter factory. Choose the implementation with SIFEN_MODE:
 *   mock (default) — no certificate, simulated SIFEN
 *   test           — real SIFEN homologación endpoints
 *   production     — real SIFEN production endpoints
 */
import type { Company, Establishment } from "@prisma/client";
import type { CompanyConfig, SifenAdapter, SifenMode } from "./types";
import { MockSifenAdapter } from "./mock-adapter";
import { RealSifenAdapter } from "./real-adapter";
import { buildCompanyConfig } from "./mapping";
import { prisma } from "@/lib/prisma";

export function getSifenMode(): SifenMode {
  const mode = (process.env.SIFEN_MODE || "mock").toLowerCase();
  if (mode === "test" || mode === "production") return mode;
  return "mock";
}

export function createSifenAdapter(company: CompanyConfig, mode = getSifenMode()): SifenAdapter {
  if (mode === "mock") return new MockSifenAdapter(company);
  return new RealSifenAdapter(company, mode);
}

/** Loads the company + establishments and returns a ready adapter. */
export async function getSifenAdapterForCompany(): Promise<{
  adapter: SifenAdapter;
  company: Company;
  config: CompanyConfig;
}> {
  const company = await prisma.company.findFirst({
    include: { establishments: true },
  });
  if (!company) throw new Error("No company configured");
  const config = buildCompanyConfig(
    company,
    (company as Company & { establishments: Establishment[] }).establishments
  );
  return { adapter: createSifenAdapter(config), company, config };
}

export * from "./types";
export { buildCompanyConfig, buildInvoiceData } from "./mapping";
export { explainSifenCode } from "./errors";
