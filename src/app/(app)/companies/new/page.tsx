import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { CompanyForm, type CompanyValues } from "../../settings/company-form";

/** Blank on purpose: nothing about a new client is guessed or pre-filled. */
const EMPTY: CompanyValues = {
  ruc: "",
  dv: "",
  razonSocial: "",
  nombreFantasia: "",
  timbradoNumero: "",
  timbradoFechaInicio: "",
  timbradoFechaFin: "",
  tipoContribuyente: 2,
  tipoRegimen: null,
  direccion: "",
  numeroCasa: "",
  departamento: 0,
  departamentoDescripcion: "",
  distrito: 0,
  distritoDescripcion: "",
  ciudad: 0,
  ciudadDescripcion: "",
  telefono: "",
  email: "",
  actividades: [],
};

export default async function NewCompanyPage() {
  const { t } = await getT();
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("companies.new")} />
      <CompanyForm initial={EMPTY} mode="create" />
    </div>
  );
}
