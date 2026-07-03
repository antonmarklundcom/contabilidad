import { getT } from "@/lib/i18n-server";

export default async function DashboardPage() {
  const { t } = await getT();
  return <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>;
}
