import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { can, normalizeRole } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SearchBox, Pagination } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { AddMemberForm, SwitchButton } from "./company-row-actions";

const PAGE_SIZE = 25;

/**
 * The companies the user belongs to (PLAN Phase 0.4b) — a firm's client list.
 * Only companies with a Membership row are listed; nothing else is visible.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t } = await getT();
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const role = normalizeRole(session!.user.role);
  const activeId = await getCompanyId();

  const q = params.q?.trim();
  const where = {
    memberships: { some: { userId } },
    ...(q
      ? {
          OR: [
            { razonSocial: { contains: q, mode: "insensitive" as const } },
            { ruc: { contains: q } },
          ],
        }
      : {}),
  };
  const page = Math.max(1, Number(params.page) || 1);
  const [count, companies] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { razonSocial: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        ruc: true,
        dv: true,
        razonSocial: true,
        _count: { select: { memberships: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title={t("companies.title")}
        description={t("companies.description")}
        actions={
          <Button asChild>
            <Link href="/companies/new">
              <Plus /> {t("companies.new")}
            </Link>
          </Button>
        }
      />
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox placeholder={t("companies.searchPlaceholder")} />
        </div>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.razonSocial")}</TableHead>
                <TableHead>{t("settings.ruc")}</TableHead>
                <TableHead>{t("companies.members")}</TableHead>
                <TableHead className="w-64" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.razonSocial}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.ruc}-{c.dv}
                  </TableCell>
                  <TableCell>{c._count.memberships}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <SwitchButton companyId={c.id} active={c.id === activeId} />
                    {can(role, "users:manage") && <AddMemberForm companyId={c.id} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pages={pages} />
      </Suspense>
    </div>
  );
}
