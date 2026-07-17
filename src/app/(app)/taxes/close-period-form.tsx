"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { closePeriodAction, reopenPeriodAction } from "./actions";

export function ClosePeriodForm({
  year,
  month,
  clean,
  closedBy,
  closedAt,
}: {
  year: number;
  month: number;
  clean: boolean;
  closedBy: string | null;
  closedAt: string | null;
}) {
  const { t, dateTime } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onClose() {
    setBusy(true);
    setError(false);
    const res = await closePeriodAction(year, month);
    setBusy(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    router.refresh();
  }

  async function onReopen() {
    setBusy(true);
    await reopenPeriodAction(year, month);
    setBusy(false);
    router.refresh();
  }

  if (closedBy) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm">
        <CheckCircle2 className="size-4 text-green-600" />
        <span>
          {t("taxes.closedBy", { user: closedBy, date: closedAt ? dateTime(new Date(closedAt)) : "" })}
        </span>
        <Button variant="ghost" size="sm" onClick={onReopen} disabled={busy}>
          <Unlock /> {t("taxes.reopen")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="default" onClick={onClose} disabled={busy || !clean}>
        <Lock /> {t("taxes.closePeriod")}
      </Button>
      {!clean && <p className="text-xs text-amber-600">{t("taxes.closeBlockedHint")}</p>}
      {error && <p className="text-xs text-destructive">{t("taxes.closeBlockedHint")}</p>}
    </div>
  );
}
