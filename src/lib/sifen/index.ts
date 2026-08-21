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
import { getCompanyId } from "@/lib/company";

export function getSifenMode(): SifenMode {
  const mode = (process.env.SIFEN_MODE || "mock").toLowerCase();
  if (mode === "test" || mode === "production") return mode;
  return "mock";
}

export function createSifenAdapter(company: CompanyConfig, mode = getSifenMode()): SifenAdapter {
  if (mode === "mock") return new MockSifenAdapter(company);
  return new RealSifenAdapter(company, mode);
}

/**
 * Loads the company + establishments and returns a ready adapter.
 *
 * `companyId` is explicit wherever the caller already knows it (the DTE
 * lifecycle knows it from the invoice), because a background job has no
 * session to resolve it from; omitting it falls back to `getCompanyId()`,
 * which is the session in a request and the sole company otherwise.
 */
export async function getSifenAdapterForCompany(companyId?: string): Promise<{
  adapter: SifenAdapter;
  company: Company;
  config: CompanyConfig;
}> {
  const id = companyId ?? (await getCompanyId());
  const company = await prisma.company.findUnique({
    where: { id },
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
