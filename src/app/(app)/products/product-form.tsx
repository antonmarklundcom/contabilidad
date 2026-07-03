"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveProduct } from "./actions";
import type { ProductInput } from "@/lib/validators";

export interface ProductFormValues extends ProductInput {
  id?: string;
}

export interface UnitOption {
  codigo: number;
  representacion: string;
  descripcion: string;
}

const EMPTY: ProductFormValues = {
  codigo: "",
  descripcionEs: "",
  descripcionEn: "",
  unidadMedida: 77,
  precioUnitario: 0,
  moneda: "PYG",
  ivaRate: "IVA_10",
  tipo: "PRODUCTO",
  active: true,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  initial,
  units,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ProductFormValues | null;
  units: UnitOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");

  const [lastKey, setLastKey] = useState<string | undefined>(initial?.id);
  if (open && (initial?.id ?? undefined) !== lastKey) {
    setValues(initial ?? EMPTY);
    setErrors({});
    setLastKey(initial?.id ?? undefined);
  }

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const filteredUnits = unitQuery
    ? units.filter(
        (u) =>
          u.descripcion.toLowerCase().includes(unitQuery.toLowerCase()) ||
          u.representacion.toLowerCase().includes(unitQuery.toLowerCase())
      )
    : units;
  const selectedUnit = units.find((u) => u.codigo === values.unidadMedida);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const res = await saveProduct(initial?.id ?? null, values);
    setSaving(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
      if (!initial?.id) setValues(EMPTY);
    } else {
      setErrors(res.errors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? t("common.edit") : t("products.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="codigo">{t("products.code")}</Label>
              <Input
                id="codigo"
                required
                value={values.codigo}
                onChange={(e) => set("codigo", e.target.value)}
              />
              {errors["codigo"] && (
                <p className="text-xs text-destructive">{t("common.error")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("products.type")}</Label>
              <Select
                value={values.tipo}
                onValueChange={(v) => set("tipo", v as ProductFormValues["tipo"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCTO">{t("products.PRODUCTO")}</SelectItem>
                  <SelectItem value="SERVICIO">{t("products.SERVICIO")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc-es">{t("products.descriptionEs")}</Label>
            <Input
              id="desc-es"
              required
              value={values.descripcionEs}
              onChange={(e) => set("descripcionEs", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc-en">
              {t("products.descriptionEn")}{" "}
              <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              id="desc-en"
              value={values.descripcionEn ?? ""}
              onChange={(e) => set("descripcionEn", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="precio">{t("products.price")}</Label>
              <Input
                id="precio"
                type="number"
                required
                min={0}
                step={values.moneda === "PYG" ? 1 : 0.01}
                value={values.precioUnitario || ""}
                onChange={(e) => set("precioUnitario", Number(e.target.value))}
                className="text-right tabular-nums"
              />
              {errors["precioUnitario"] === "pyg_no_decimals" && (
                <p className="text-xs text-destructive">{t("invoices.pygNoDecimals")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.currency")}</Label>
              <Select
                value={values.moneda}
                onValueChange={(v) => set("moneda", v as "PYG" | "USD")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PYG">PYG</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("products.iva")}</Label>
              <Select
                value={values.ivaRate}
                onValueChange={(v) => set("ivaRate", v as ProductFormValues["ivaRate"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IVA_10">{t("products.iva10")}</SelectItem>
                  <SelectItem value="IVA_5">{t("products.iva5")}</SelectItem>
                  <SelectItem value="EXENTA">{t("products.exenta")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("products.unit")}</Label>
            <Select
              value={String(values.unidadMedida)}
              onValueChange={(v) => set("unidadMedida", Number(v))}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedUnit
                    ? `${selectedUnit.representacion} — ${selectedUnit.descripcion}`
                    : String(values.unidadMedida)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <div className="p-1">
                  <Input
                    placeholder={t("products.searchUnit")}
                    value={unitQuery}
                    onChange={(e) => setUnitQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                {filteredUnits.slice(0, 40).map((u) => (
                  <SelectItem key={u.codigo} value={String(u.codigo)}>
                    {u.representacion} — {u.descripcion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="active"
              checked={values.active}
              onCheckedChange={(v) => set("active", v === true)}
            />
            <Label htmlFor="active">{t("products.active")}</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
