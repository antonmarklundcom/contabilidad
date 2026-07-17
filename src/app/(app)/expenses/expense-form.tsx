"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveExpense } from "./actions";
import type { ExpenseInput, ExpenseItemInput } from "@/lib/validators";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { computeDeducible, itemIva, itemsMatchTotal } from "@/lib/deductibility";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, Sparkles, Trash2 } from "lucide-react";

export interface CategoryOption {
  id: string;
  label: string;
}

export interface ExpenseFormValues extends ExpenseInput {
  id?: string;
}

const LOW_CONFIDENCE = 0.8;

export function ExpenseForm({
  initial,
  categories,
  confidences,
  warnings,
  fileUrl,
  fileMime,
}: {
  initial: ExpenseFormValues;
  categories: CategoryOption[];
  confidences?: Record<string, number> | null;
  warnings?: string[];
  fileUrl?: string | null;
  fileMime?: string | null;
}) {
  const { t, money } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState<ExpenseFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState(warnings?.includes("totals_mismatch") ?? false);

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const setItem = (index: number, patch: Partial<ExpenseItemInput>) =>
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const deducibleTotals = computeDeducible({
    iva10: Number(values.iva10 || 0),
    iva5: Number(values.iva5 || 0),
    deduciblePercent: values.deduciblePercent,
    moneda: values.moneda,
    items: values.items.map((it) => ({
      total: Number(it.total) || 0,
      tasa: it.tasa,
      deduciblePercent: it.deduciblePercent,
    })),
  });
  const itemsOk = itemsMatchTotal(
    values.items.map((it) => ({ total: Number(it.total) || 0, tasa: it.tasa, deduciblePercent: it.deduciblePercent })),
    Number(values.total) || 0,
    values.moneda
  );

  const lowConf = (field: string) =>
    confidences && confidences[field] !== undefined && confidences[field] < LOW_CONFIDENCE;

  const sumParts =
    Number(values.gravada10 || 0) +
    Number(values.gravada5 || 0) +
    Number(values.exenta || 0) +
    Number(values.iva10 || 0) +
    Number(values.iva5 || 0);
  const totalsMismatch =
    Number(values.total) > 0 && Math.abs(sumParts - Number(values.total)) > (values.moneda === "USD" ? 0.06 : 5);

  async function onSubmit(confirm: boolean) {
    setSaving(true);
    setErrors({});
    const res = await saveExpense(initial.id ?? null, values, { confirm });
    setSaving(false);
    if (res.ok) {
      if (res.duplicateOfId && !dupWarning) {
        setDupWarning(true);
        return;
      }
      router.push("/expenses");
      router.refresh();
    } else {
      setErrors(res.errors);
    }
  }

  const rucInvalid =
    values.supplierRuc &&
    values.supplierDv &&
    String(calcularDigitoVerificador(values.supplierRuc)) !== values.supplierDv;

  const fieldClass = (field: string) =>
    cn("text-right tabular-nums", lowConf(field) && "border-amber-400 bg-amber-50");
  const textFieldClass = (field: string) => cn(lowConf(field) && "border-amber-400 bg-amber-50");

  const numberField = (
    key: "gravada10" | "gravada5" | "exenta" | "iva10" | "iva5" | "total",
    labelKey: string
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{t(labelKey)}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        step={values.moneda === "PYG" ? 1 : 0.01}
        value={values[key] || ""}
        onChange={(e) => set(key, Number(e.target.value))}
        className={fieldClass(key)}
      />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* File preview */}
      {fileUrl && (
        <div className="order-2 lg:order-1">
          <div className="sticky top-20 overflow-hidden rounded-lg border bg-card">
            {fileMime === "application/pdf" ? (
              <iframe src={fileUrl} className="h-[600px] w-full" title="receipt" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt="receipt" className="max-h-[600px] w-full object-contain" />
            )}
          </div>
        </div>
      )}

      {/* Fields */}
      <div className={cn("space-y-4", fileUrl ? "order-1 lg:order-2" : "lg:col-span-2 max-w-2xl")}>
        {confidences && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>{t("expenses.reviewHint")}</AlertDescription>
          </Alert>
        )}

        {(totalsMismatch || dupWarning) && (
          <div className="space-y-2">
            {totalsMismatch && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>
                  {t("expenses.totalsMismatch", {
                    sum: money(sumParts, values.moneda),
                    total: money(Number(values.total), values.moneda),
                  })}
                </AlertDescription>
              </Alert>
            )}
            {dupWarning && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{t("expenses.duplicateWarning")}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="razon">{t("expenses.supplier")}</Label>
            <Input
              id="razon"
              value={values.supplierRazonSocial ?? ""}
              onChange={(e) => set("supplierRazonSocial", e.target.value)}
              className={textFieldClass("razonSocial")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ruc">{t("expenses.supplierRuc")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ruc"
                value={values.supplierRuc ?? ""}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setValues((v) => ({
                    ...v,
                    supplierRuc: clean,
                    supplierDv: clean ? String(calcularDigitoVerificador(clean)) : "",
                  }));
                }}
                className={cn("flex-1", textFieldClass("rucEmisor"))}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                aria-label="DV"
                value={values.supplierDv ?? ""}
                onChange={(e) => set("supplierDv", e.target.value)}
                className="w-12 text-center"
              />
            </div>
            {rucInvalid && <p className="text-xs text-destructive">{t("expenses.rucInvalid")}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="timbrado">{t("expenses.timbrado")}</Label>
            <Input
              id="timbrado"
              value={values.timbrado ?? ""}
              onChange={(e) => set("timbrado", e.target.value)}
              className={textFieldClass("timbrado")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">{t("expenses.comprobanteType")}</Label>
            <Input
              id="tipo"
              value={values.tipoComprobante ?? ""}
              onChange={(e) => set("tipoComprobante", e.target.value)}
              className={textFieldClass("tipoComprobante")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numero">{t("expenses.comprobanteNumber")}</Label>
            <Input
              id="numero"
              value={values.numeroComprobante ?? ""}
              onChange={(e) => set("numeroComprobante", e.target.value)}
              className={textFieldClass("numeroComprobante")}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fecha">{t("common.date")}</Label>
            <Input
              id="fecha"
              type="date"
              value={
                values.fecha
                  ? new Date(values.fecha).toISOString().slice(0, 10)
                  : ""
              }
              onChange={(e) => set("fecha", e.target.value ? new Date(e.target.value) : undefined)}
              className={cn(warnings?.includes("date_odd") && "border-amber-400 bg-amber-50")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.currency")}</Label>
            <Select value={values.moneda} onValueChange={(v) => set("moneda", v as "PYG" | "USD")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PYG">PYG</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {numberField("gravada10", "books.gravada10")}
          {numberField("gravada5", "books.gravada5")}
          {numberField("exenta", "books.exentas")}
          {numberField("iva10", "books.iva10")}
          {numberField("iva5", "books.iva5")}
          {numberField("total", "common.total")}
        </div>

        {/* ── Items & IVA deductibility ─────────────────────────────── */}
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <Label>{t("expenses.items")}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set("items", [
                  ...values.items,
                  { descripcion: "", total: 0, tasa: 10, deduciblePercent: 100, deducibleReason: "", aiSuggested: false },
                ])
              }
            >
              <Plus /> {t("expenses.addItem")}
            </Button>
          </div>

          {values.items.length === 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("expenses.noItemsHint")}</p>
              <div className="flex items-center gap-2">
                <Label htmlFor="deduciblePercent" className="text-xs">
                  {t("expenses.deduciblePercent")}
                </Label>
                <Input
                  id="deduciblePercent"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={values.deduciblePercent}
                  onChange={(e) => set("deduciblePercent", Number(e.target.value))}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ) : (
            <>
              {!itemsOk && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <AlertDescription>{t("expenses.itemsMismatch")}</AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">{t("expenses.itemDescription")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{t("common.total")}</th>
                      <th className="py-1.5 pr-2 font-medium">{t("expenses.itemTasa")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{t("expenses.deducibleShort")}</th>
                      <th className="py-1.5 pr-2 text-right font-medium">{t("expenses.ivaDeducible")}</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {values.items.map((item, i) => {
                      const iva = itemIva(Number(item.total) || 0, item.tasa, values.moneda);
                      const deducible =
                        Math.round(iva * (item.deduciblePercent / 100) * 100) / 100;
                      return (
                        <tr key={i} className="border-b align-top last:border-0">
                          <td className="py-1.5 pr-2">
                            <Input
                              value={item.descripcion}
                              onChange={(e) => setItem(i, { descripcion: e.target.value })}
                              className="h-8"
                            />
                            {item.deducibleReason && (
                              <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                                {item.aiSuggested && <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />}
                                {item.deducibleReason}
                              </p>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              type="number"
                              min={0}
                              step={values.moneda === "PYG" ? 1 : 0.01}
                              value={item.total || ""}
                              onChange={(e) => setItem(i, { total: Number(e.target.value) })}
                              className="h-8 w-28 text-right tabular-nums"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Select
                              value={String(item.tasa)}
                              onValueChange={(v) => setItem(i, { tasa: Number(v) })}
                            >
                              <SelectTrigger className="h-8 w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="10">10%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="0">{t("expenses.exenta")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={item.deduciblePercent}
                                onChange={(e) =>
                                  setItem(i, {
                                    deduciblePercent: Number(e.target.value),
                                    aiSuggested: false,
                                  })
                                }
                                className={cn(
                                  "h-8 w-16 text-right tabular-nums",
                                  item.aiSuggested && item.deduciblePercent < 100 && "border-amber-400 bg-amber-50"
                                )}
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                            {money(deducible, values.moneda)}
                          </td>
                          <td className="py-1.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label={t("common.delete")}
                              onClick={() =>
                                set("items", values.items.filter((_, j) => j !== i))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t pt-2 text-sm">
            <span className="text-muted-foreground">
              {t("expenses.ivaNoDeducible")}:{" "}
              <span className="tabular-nums">{money(deducibleTotals.ivaNoDeducible, values.moneda)}</span>
            </span>
            <span className="font-medium">
              {t("expenses.ivaDeducibleTotal")}:{" "}
              <span className="tabular-nums">{money(deducibleTotals.ivaDeducible, values.moneda)}</span>
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("expenses.category")}</Label>
          <Select
            value={values.categoryId || ""}
            onValueChange={(v) => set("categoryId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("expenses.selectCategory")} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {values.supplierRuc && values.categoryId && (
            <p className="text-xs text-muted-foreground">{t("expenses.categoryRemembered")}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">{t("clients.notes")}</Label>
          <Textarea
            id="notes"
            rows={2}
            value={values.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {errors._ && <p className="text-sm text-destructive">{t("common.error")}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onSubmit(false)}>
            {t("common.save")}
          </Button>
          <Button disabled={saving} onClick={() => onSubmit(true)}>
            {saving ? t("common.saving") : t("expenses.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
