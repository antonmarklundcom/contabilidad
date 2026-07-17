import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/page-header";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const { t } = await getT();
  return (
    <div>
      <PageHeader title={t("expenses.importTitle")} />
      <ImportClient />
    </div>
  );
}
