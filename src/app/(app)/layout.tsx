import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId, memberCompanies } from "@/lib/company";
import { getSifenMode } from "@/lib/sifen";
import { AppShell } from "@/components/app-shell";
import { startJobRunner } from "@/lib/jobs/runner";
import { normalizeRole } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Boot the in-process job runner (no-op if already running).
  startJobRunner();

  const activeCompanyId = await getCompanyId();
  const [company, companies] = await Promise.all([
    prisma.company.findUnique({ where: { id: activeCompanyId }, select: { razonSocial: true } }),
    memberCompanies(session.user.id),
  ]);

  return (
    <AppShell
      companyName={company?.razonSocial ?? "—"}
      sifenMode={getSifenMode()}
      userName={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? ""}
      role={normalizeRole(session.user.role)}
      companies={companies}
      activeCompanyId={activeCompanyId}
    >
      {children}
    </AppShell>
  );
}
