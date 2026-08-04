"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";

/**
 * Filing lifecycle pill. Separate from `status-badge.tsx` because the filing
 * states share names with document states (DRAFT) but mean something different
 * and read from their own `taxes.filingStatus.*` dictionary.
 */
const VARIANTS: Record<string, "success" | "warning" | "info" | "muted"> = {
  DRAFT: "muted",
  CLOSED: "warning",
  SUBMITTED: "info",
  PAID: "success",
};

export function FilingStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <Badge variant={VARIANTS[status] ?? "muted"}>{t(`taxes.filingStatus.${status}`)}</Badge>;
}
