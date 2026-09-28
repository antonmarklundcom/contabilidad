"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowed } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { isMember } from "@/lib/company";
import { validateNewCompany, validateNewUser } from "@/lib/company-admin";
import type { CompanyValues } from "../settings/company-form";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Onboards a client company (PLAN Phase 0.4b). The creator becomes a member,
 * so it appears in their switcher; nobody else sees it until added.
 */
export async function createCompany(v: CompanyValues): Promise<Result<{ id: string }>> {
  if (!(await allowed("companies:create"))) return { ok: false, error: "forbidden" };
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "forbidden" };

  const invalid = validateNewCompany(v);
  if (invalid) return { ok: false, error: invalid };

  // Same RUC twice is almost always a double click or a client onboarded
  // twice. The creator gets told, not a second tenant.
  const existing = await prisma.company.findFirst({ where: { ruc: v.ruc }, select: { id: true } });
  if (existing) return { ok: false, error: "duplicate_ruc" };

  const company = await prisma.$transaction(async (tx) => {
    const c = await tx.company.create({
      data: {
        ruc: v.ruc,
        dv: v.dv,
        razonSocial: v.razonSocial.trim(),
        nombreFantasia: v.nombreFantasia || null,
        actividades: v.actividades.filter((a) => a.codigo && a.descripcion),
        timbradoNumero: v.timbradoNumero,
        timbradoFechaInicio: new Date(v.timbradoFechaInicio),
        timbradoFechaFin: v.timbradoFechaFin ? new Date(v.timbradoFechaFin) : null,
        tipoContribuyente: v.tipoContribuyente,
        tipoRegimen: v.tipoRegimen,
        direccion: v.direccion,
        numeroCasa: v.numeroCasa || "0",
        departamento: v.departamento,
        departamentoDescripcion: v.departamentoDescripcion,
        distrito: v.distrito,
        distritoDescripcion: v.distritoDescripcion,
        ciudad: v.ciudad,
        ciudadDescripcion: v.ciudadDescripcion,
        telefono: v.telefono || null,
        email: v.email || null,
      },
    });
    await tx.membership.create({ data: { userId: session.user.id, companyId: c.id } });
    return c;
  });

  await audit("create", "company", company.id, { ruc: v.ruc });
  revalidatePath("/companies");
  return { ok: true, id: company.id };
}

/**
 * Gives a user access to a company the acting admin belongs to. An unknown
 * email creates the login with the initial password the admin chose; a known
 * one just gains the membership (their password and role are left alone).
 */
export async function addMember(input: {
  companyId: string;
  email: string;
  name: string;
  role: string;
  password: string;
}): Promise<Result<{ created: boolean }>> {
  if (!(await allowed("users:manage"))) return { ok: false, error: "forbidden" };
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "forbidden" };

  // Only into a company the admin can already open — never someone else's.
  const mayOpen =
    input.companyId === session.user.companyId ||
    (await isMember(session.user.id, input.companyId));
  if (!mayOpen) {
    await audit("denied", "membership", input.companyId);
    return { ok: false, error: "forbidden" };
  }

  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    await prisma.membership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: input.companyId } },
      update: {},
      create: { userId: user.id, companyId: input.companyId },
    });
    await audit("create", "membership", input.companyId, { userId: user.id });
    revalidatePath("/companies");
    return { ok: true, created: false };
  }

  const invalid = validateNewUser({ ...input, email });
  if (invalid) return { ok: false, error: invalid };

  const created = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 12),
      companyId: input.companyId,
      memberships: { create: { companyId: input.companyId } },
    },
  });
  // Never the password, not even hashed.
  await audit("create", "user", created.id, { companyId: input.companyId, role: input.role });
  revalidatePath("/companies");
  return { ok: true, created: true };
}
