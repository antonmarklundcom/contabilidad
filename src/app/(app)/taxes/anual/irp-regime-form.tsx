"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { useUrlParam } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Check, Save } from "lucide-react";
import type { IrpRegime } from "@/lib/irp";
import { saveIrpRegimeAction } from "./actions";

/**
 * Which IRP regime the taxpayer is in.
 *
 * Nothing infers this. The selector previews a regime through the URL (so the
 * figures update as you look), but the *declared* regime is a separate,
 * explicit save — and closing the year needs the declared one. PLAN Phase 7.4
 * asked for the regime to be confirmed rather than guessed; this is where the
 * confirming happens.
 */
export function IrpRegimeForm({
  selected,
  stored,
}: {
  selected: IrpRegime;
  stored: IrpRegime | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const setParams = useUrlParam();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const label = (r: IrpRegime) => t(r === "RSP" ? "taxes.irp.regimeRSP" : "taxes.irp.regimeRGC");

  async function onSave() {
    setBusy(true);
    setSaved(false);
    const res = await saveIrpRegimeAction({ regime: selected });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("taxes.irp.regime")}</span>
        <Select
          value={selected}
          onValueChange={(v) => {
            setSaved(false);
            setParams({ regime: v });
          }}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RSP">{label("RSP")}</SelectItem>
            <SelectItem value="RGC">{label("RGC")}</SelectItem>
          </SelectContent>
        </Select>
        {stored !== selected && (
          <Button variant="outline" size="sm" onClick={onSave} disabled={busy}>
            <Save /> {t("taxes.irp.regimeSave")}
          </Button>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="size-3" /> {t("taxes.irp.regimeSaved")}
          </span>
        )}
      </div>

      {stored === null ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>{t("taxes.irp.regimeNotSet")}</AlertDescription>
        </Alert>
      ) : (
        stored !== selected && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              {t("taxes.irp.regimePreview", { regime: label(selected) })}
            </AlertDescription>
          </Alert>
        )
      )}
    </div>
  );
}
