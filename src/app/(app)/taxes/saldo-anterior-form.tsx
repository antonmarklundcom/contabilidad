"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveSaldoAnterior } from "./actions";

export function SaldoAnteriorForm({
  year,
  month,
  value,
}: {
  year: number;
  month: number;
  value: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setSaved(false);
    const res = await saveSaldoAnterior(year, month, v);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="saldoAnterior">{t("taxes.saldoAnterior")}</Label>
        <Input
          id="saldoAnterior"
          type="number"
          min={0}
          step={1}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="w-48 text-right tabular-nums"
        />
      </div>
      <Button variant="outline" onClick={onSave} disabled={saving}>
        {saving ? t("common.saving") : saved ? t("taxes.saved") : t("common.save")}
      </Button>
    </div>
  );
}
