import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSifenMode } from "@/lib/sifen";
import { AppShell } from "@/components/app-shell";
import { startJobRunner } from "@/lib/jobs/runner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Boot the in-process job runner (no-op if already running).
  startJobRunner();

  const company = await prisma.company.findFirst({ select: { razonSocial: true } });

  return (
    <AppShell
      companyName={company?.razonSocial ?? "—"}
      sifenMode={getSifenMode()}
      userName={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
