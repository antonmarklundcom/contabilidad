import { getT } from "@/lib/i18n-server";
import { anthropicConfigured } from "@/lib/ocr";
import { PageHeader } from "@/components/page-header";
import { UploadClient } from "./upload-client";

export default async function UploadPage() {
  const { t } = await getT();
  return (
    <div>
      <PageHeader title={t("expenses.uploadTitle")} />
      <UploadClient ocrConfigured={anthropicConfigured()} />
    </div>
  );
}
