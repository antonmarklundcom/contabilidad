"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { canReopenFiling } from "@/lib/tax/filing-status";
import type { FilingStatus } from "@/lib/tax/filing-status";
import { closePeriodAction, reopenPeriodAction } from "./actions";

export function ClosePeriodForm({
  year,
  month,
  clean,
  closedBy,
  closedAt,
  status,
}: {
  year: number;
  month: number;
  clean: boolean;
  closedBy: string | null;
  closedAt: string | null;
  status: FilingStatus | null;
}) {
  const { t, dateTime } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"unresolved" | "locked" | null>(null);

  async function onClose() {
    setBusy(true);
    setError(null);
    const res = await closePeriodAction(year, month);
    setBusy(false);
    if (!res.ok) {
      setError(res.error === "locked" ? "locked" : "unresolved");
      return;
    }
    router.refresh();
  }

  async function onReopen() {
    setBusy(true);
    setError(null);
    const res = await reopenPeriodAction(year, month);
    setBusy(false);
    if (!res.ok) {
      setError("locked");
      return;
    }
    router.refresh();
  }

  if (closedBy) {
    // Once the filing is SUBMITTED/PAID its snapshot is a declared fact: the
    // server refuses to withdraw it, so the button is not offered either.
    const reopenable = status ? canReopenFiling(status) : true;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 text-green-600" />
          <span>
            {t("taxes.closedBy", { user: closedBy, date: closedAt ? dateTime(new Date(closedAt)) : "" })}
          </span>
          {reopenable ? (
            <Button variant="ghost" size="sm" onClick={onReopen} disabled={busy}>
              <Unlock /> {t("taxes.reopen")}
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" /> {t("taxes.filingLockedHint")}
            </span>
          )}
        </div>
        {error === "locked" && (
          <p className="text-xs text-destructive">{t("taxes.filingLockedHint")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="default" onClick={onClose} disabled={busy || !clean}>
        <Lock /> {t("taxes.closePeriod")}
      </Button>
      {!clean && <p className="text-xs text-amber-600">{t("taxes.closeBlockedHint")}</p>}
      {error === "unresolved" && (
        <p className="text-xs text-destructive">{t("taxes.closeBlockedHint")}</p>
      )}
      {error === "locked" && (
        <p className="text-xs text-destructive">{t("taxes.filingLockedHint")}</p>
      )}
    </div>
  );
}
