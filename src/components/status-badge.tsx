"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";

const VARIANTS: Record<string, "success" | "warning" | "destructive" | "info" | "muted" | "secondary"> = {
  DRAFT: "muted",
  QUEUED: "info",
  SENT: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "secondary",
  CONTINGENCY: "warning",
  NEEDS_REVIEW: "warning",
  CONFIRMED: "success",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <Badge variant={VARIANTS[status] ?? "muted"}>{t(`status.${status}`)}</Badge>;
}
