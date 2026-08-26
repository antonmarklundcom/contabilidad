"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, Unlock } from "lucide-react";
import { canReopenFiling } from "@/lib/tax/filing-status";
import type { FilingStatus } from "@/lib/tax/filing-status";
import { closeAnnualAction, reopenAnnualAction, type AnnualCloseError } from "./actions";

/**
 * The annual sign-off — `close-period-form.tsx` for a fiscal year.
 *
 * Same rules: an immutable snapshot, a reopen offered only while the filing
 * is still withdrawable, and every refusal explained rather than swallowed.
 * Two refusals are annual-only — no declared regime, and a regime whose rules
 * were never confirmed.
 */
export function CloseYearForm({
  year,
  clean,
  closable,
  closedBy,
  closedAt,
  status,
}: {
  year: number;
  clean: boolean;
  /** False when the regime is undeclared or a stub — the server refuses too. */
  closable: boolean;
  closedBy: string | null;
  closedAt: string | null;
  status: FilingStatus | null;
}) {
  const { t, dateTime } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AnnualCloseError | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: AnnualCloseError }>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "unresolved");
      return;
    }
    router.refresh();
  }

  const message = (e: AnnualCloseError) => {
    if (e === "locked") return t("taxes.filingLockedHint");
    if (e === "no_regime") return t("taxes.irp.regimeNotSet");
    if (e === "stub_regime") return t("taxes.irp.regimeStub");
    return t("taxes.irp.closeBlockedHint");
  };

  if (closedBy) {
    const reopenable = status ? canReopenFiling(status) : true;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 text-green-600" />
          <span>
            {t("taxes.irp.closedBy", {
              user: closedBy,
              date: closedAt ? dateTime(new Date(closedAt)) : "",
            })}
          </span>
          {reopenable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(() => reopenAnnualAction({ year }))}
              disabled={busy}
            >
              <Unlock /> {t("taxes.reopen")}
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" /> {t("taxes.filingLockedHint")}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-destructive">{message(error)}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="default"
        onClick={() => run(() => closeAnnualAction({ year }))}
        disabled={busy || !clean || !closable}
      >
        <Lock /> {t("taxes.irp.closeYear")}
      </Button>
      {!clean && <p className="text-xs text-amber-600">{t("taxes.irp.closeBlockedHint")}</p>}
      {error && <p className="text-xs text-destructive">{message(error)}</p>}
    </div>
  );
}
