import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { getT } from "@/lib/i18n-server";
import { getSifenMode } from "@/lib/sifen";
import { smtpConfigured } from "@/lib/mailer";
import { listBackups } from "@/lib/backup";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyForm, type CompanyValues } from "./company-form";
import {
  SequencesPanel,
  CertificatePanel,
  SifenModePanel,
  SmtpPanel,
  BackupPanel,
  PasswordPanel,
  type SequenceRow,
} from "./settings-panels";

export default async function SettingsPage() {
  const { t } = await getT();
  const companyId = await getCompanyId();
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const points = await prisma.expeditionPoint.findMany({
    where: { companyId },
    include: { establishment: true, sequences: { orderBy: { tipoDocumento: "asc" } } },
    orderBy: { codigo: "asc" },
  });
  const sequences: SequenceRow[] = points.flatMap((p) =>
    p.sequences.map((s) => ({
      id: s.id,
      establecimiento: p.establishment.codigo,
      punto: p.codigo,
      tipoDocumento: s.tipoDocumento,
      currentNumber: s.currentNumber,
    }))
  );

  const backups = listBackups().map((b) => ({
    name: b.name,
    size: b.size,
    createdAt: b.createdAt.toISOString(),
  }));

  const companyValues: CompanyValues = {
    ruc: company.ruc,
    dv: company.dv,
    razonSocial: company.razonSocial,
    nombreFantasia: company.nombreFantasia ?? "",
    timbradoNumero: company.timbradoNumero,
    timbradoFechaInicio: company.timbradoFechaInicio.toISOString().slice(0, 10),
    timbradoFechaFin: company.timbradoFechaFin?.toISOString().slice(0, 10) ?? "",
    tipoContribuyente: company.tipoContribuyente,
    tipoRegimen: company.tipoRegimen,
    direccion: company.direccion,
    numeroCasa: company.numeroCasa,
    departamento: company.departamento,
    departamentoDescripcion: company.departamentoDescripcion,
    distrito: company.distrito,
    distritoDescripcion: company.distritoDescripcion,
    ciudad: company.ciudad,
    ciudadDescripcion: company.ciudadDescripcion,
    telefono: company.telefono ?? "",
    email: company.email ?? "",
    actividades: (company.actividades as { codigo: string; descripcion: string }[]) ?? [],
  };

  return (
    <div>
      <PageHeader title={t("settings.title")} />
      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">{t("settings.company")}</TabsTrigger>
          <TabsTrigger value="sequences">{t("settings.sequences")}</TabsTrigger>
          <TabsTrigger value="certificate">{t("settings.certificate")}</TabsTrigger>
          <TabsTrigger value="integrations">{t("settings.smtp")}</TabsTrigger>
          <TabsTrigger value="backup">{t("settings.backup")}</TabsTrigger>
          <TabsTrigger value="users">{t("settings.users")}</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyForm initial={companyValues} />
        </TabsContent>
        <TabsContent value="sequences">
          <SequencesPanel sequences={sequences} />
        </TabsContent>
        <TabsContent value="certificate" className="space-y-6">
          <SifenModePanel mode={getSifenMode()} />
          <CertificatePanel
            hasCert={Boolean(company.certPath)}
            expiresAt={company.certExpiresAt?.toISOString() ?? null}
          />
        </TabsContent>
        <TabsContent value="integrations">
          <SmtpPanel configured={smtpConfigured()} />
        </TabsContent>
        <TabsContent value="backup">
          <BackupPanel backups={backups} />
        </TabsContent>
        <TabsContent value="users">
          <PasswordPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
