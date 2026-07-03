"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { audit } from "@/lib/audit";
import { ensureSequence } from "@/lib/sequences";
import { testSmtp } from "@/lib/mailer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

export async function saveCompany(input: {
  ruc: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  timbradoNumero: string;
  timbradoFechaInicio: string;
  tipoContribuyente: number;
  tipoRegimen: number | null;
  direccion: string;
  numeroCasa: string;
  departamento: number;
  departamentoDescripcion: string;
  distrito: number;
  distritoDescripcion: string;
  ciudad: number;
  ciudadDescripcion: string;
  telefono: string;
  email: string;
  actividades: { codigo: string; descripcion: string }[];
}): Promise<Result> {
  const companyId = await getCompanyId();
  if (!/^[0-9]{1,8}$/.test(input.ruc) || !/^[0-9]$/.test(input.dv)) {
    return { ok: false, error: "invalid_ruc" };
  }
  await prisma.company.update({
    where: { id: companyId },
    data: {
      ruc: input.ruc,
      dv: input.dv,
      razonSocial: input.razonSocial,
      nombreFantasia: input.nombreFantasia || null,
      timbradoNumero: input.timbradoNumero,
      timbradoFechaInicio: new Date(input.timbradoFechaInicio),
      tipoContribuyente: input.tipoContribuyente,
      tipoRegimen: input.tipoRegimen,
      direccion: input.direccion,
      numeroCasa: input.numeroCasa || "0",
      departamento: input.departamento,
      departamentoDescripcion: input.departamentoDescripcion,
      distrito: input.distrito,
      distritoDescripcion: input.distritoDescripcion,
      ciudad: input.ciudad,
      ciudadDescripcion: input.ciudadDescripcion,
      telefono: input.telefono || null,
      email: input.email || null,
      actividades: input.actividades,
    },
  });
  await audit("update", "settings", companyId, { section: "company" });
  revalidatePath("/settings");
  return { ok: true };
}

export async function addExpeditionPoint(
  establishmentCodigo: string,
  puntoCodigo: string
): Promise<Result> {
  const companyId = await getCompanyId();
  if (!/^[0-9]{3}$/.test(establishmentCodigo) || !/^[0-9]{3}$/.test(puntoCodigo)) {
    return { ok: false, error: "invalid_code" };
  }
  const est = await prisma.establishment.upsert({
    where: { companyId_codigo: { companyId, codigo: establishmentCodigo } },
    update: {},
    create: { companyId, codigo: establishmentCodigo },
  });
  const point = await prisma.expeditionPoint.upsert({
    where: { establishmentId_codigo: { establishmentId: est.id, codigo: puntoCodigo } },
    update: {},
    create: { companyId, establishmentId: est.id, codigo: puntoCodigo },
  });
  // Create sequences for factura, nota de crédito, nota de débito.
  for (const tipo of [1, 5, 6]) await ensureSequence(companyId, point.id, tipo);
  revalidatePath("/settings");
  return { ok: true };
}

export async function setSequenceNumber(
  sequenceId: string,
  currentNumber: number
): Promise<Result> {
  const companyId = await getCompanyId();
  if (currentNumber < 0 || currentNumber > 9_999_999) {
    return { ok: false, error: "out_of_range" };
  }
  await prisma.documentSequence.updateMany({
    where: { id: sequenceId, companyId },
    data: { currentNumber },
  });
  await audit("update", "settings", companyId, { section: "sequence", sequenceId, currentNumber });
  revalidatePath("/settings");
  return { ok: true };
}

export async function testSmtpAction(): Promise<Result> {
  try {
    await testSmtp();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function changePassword(newPassword: string): Promise<Result> {
  if (newPassword.length < 8) return { ok: false, error: "too_short" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
  await audit("update", "settings", session.user.companyId ?? undefined, { section: "password" });
  return { ok: true };
}
