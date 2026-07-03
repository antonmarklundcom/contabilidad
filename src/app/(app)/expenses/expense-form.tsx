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
import type { ExpenseInput } from "@/lib/validators";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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
