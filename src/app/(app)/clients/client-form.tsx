"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveClient } from "./actions";
import type { ClientInput } from "@/lib/validators";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { Loader2 } from "lucide-react";

export interface ClientFormValues extends ClientInput {
  id?: string;
}

const EMPTY: ClientFormValues = {
  docType: "RUC",
  ruc: "",
  dv: "",
  documentoNumero: "",
  razonSocial: "",
  nombreFantasia: "",
  email: "",
  telefono: "",
  direccion: "",
  pais: "PRY",
  paisDescripcion: "Paraguay",
  isTaxpayer: true,
  tipoContribuyente: 1,
  notes: "",
};

export function ClientFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ClientFormValues | null;
  onSaved?: (id: string, razonSocial: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rucLookup, setRucLookup] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Reset when opening for a different record.
  const [lastKey, setLastKey] = useState<string | undefined>(initial?.id);
  if (open && (initial?.id ?? undefined) !== lastKey) {
    setValues(initial ?? EMPTY);
    setErrors({});
    setRucLookup(null);
    setLastKey(initial?.id ?? undefined);
  }

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const expectedDv =
    values.ruc && /^[0-9]{1,8}$/.test(values.ruc)
      ? String(calcularDigitoVerificador(values.ruc))
      : null;

  function onRucChange(ruc: string) {
    const clean = ruc.replace(/\D/g, "").slice(0, 8);
    setValues((v) => ({
      ...v,
      ruc: clean,
      dv: clean ? String(calcularDigitoVerificador(clean)) : "",
    }));
  }

  async function lookupRuc() {
    if (!values.ruc || !expectedDv) return;
    setLookingUp(true);
    setRucLookup(null);
    try {
      const res = await fetch(`/api/ruc/${values.ruc}-${expectedDv}`);
      const json = await res.json();
      if (res.ok) {
        setRucLookup(t("clients.rucFound", { name: json.razonSocial, estado: json.estado }));
        if (!values.razonSocial) set("razonSocial", json.razonSocial);
      } else {
        setRucLookup(json.error === "invalid_ruc" ? t("clients.dvInvalid") : t("clients.rucNotFound"));
      }
    } catch {
      setRucLookup(t("common.error"));
    } finally {
      setLookingUp(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const res = await saveClient(initial?.id ?? null, values);
    setSaving(false);
    if (res.ok) {
      onOpenChange(false);
      onSaved?.(res.id, values.razonSocial);
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
          <DialogTitle>{initial?.id ? t("common.edit") : t("clients.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("clients.docType")}</Label>
              <Select
                value={values.docType}
                onValueChange={(v) => set("docType", v as ClientFormValues["docType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["RUC", "CI", "PASAPORTE", "INNOMINADO"] as const).map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {t(`clients.${dt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {values.docType === "RUC" && (
              <div className="space-y-1.5">
                <Label htmlFor="ruc">{t("clients.rucNumber")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ruc"
                    inputMode="numeric"
                    value={values.ruc ?? ""}
                    onChange={(e) => onRucChange(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    aria-label={t("clients.dv")}
                    value={values.dv ?? ""}
                    readOnly
                    className="w-12 text-center"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("clients.dvAuto")}</p>
                {errors["dv"] && (
                  <p className="text-xs text-destructive">{t("clients.dvInvalid")}</p>
                )}
              </div>
            )}

            {(values.docType === "CI" || values.docType === "PASAPORTE") && (
              <div className="space-y-1.5">
                <Label htmlFor="docnum">
                  {values.docType === "CI" ? t("clients.ciNumber") : t("clients.passportNumber")}
                </Label>
                <Input
                  id="docnum"
                  value={values.documentoNumero ?? ""}
                  onChange={(e) => set("documentoNumero", e.target.value)}
                />
                {errors["documentoNumero"] && (
                  <p className="text-xs text-destructive">{t("common.required")}</p>
                )}
              </div>
            )}
          </div>

          {values.docType === "RUC" && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={lookupRuc}
                disabled={!expectedDv || lookingUp}
              >
                {lookingUp && <Loader2 className="animate-spin" />}
                {lookingUp ? t("clients.querying") : t("clients.queryRuc")}
              </Button>
              {rucLookup && <p className="text-xs text-muted-foreground">{rucLookup}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="razon">{t("clients.razonSocial")}</Label>
            <Input
              id="razon"
              required
              value={values.razonSocial}
              onChange={(e) => set("razonSocial", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("clients.email")}</Label>
              <Input
                id="email"
                type="email"
                value={values.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("clients.phone")}</Label>
              <Input
                id="phone"
                value={values.telefono ?? ""}
                onChange={(e) => set("telefono", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dir">{t("clients.address")}</Label>
            <Input
              id="dir"
              value={values.direccion ?? ""}
              onChange={(e) => set("direccion", e.target.value)}
            />
          </div>

          {values.docType === "RUC" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("clients.tipoContribuyente")}</Label>
                <Select
                  value={String(values.tipoContribuyente ?? 1)}
                  onValueChange={(v) => set("tipoContribuyente", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("clients.fisica")}</SelectItem>
                    <SelectItem value="2">{t("clients.juridica")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox
                  id="taxpayer"
                  checked={values.isTaxpayer}
                  onCheckedChange={(v) => set("isTaxpayer", v === true)}
                />
                <Label htmlFor="taxpayer">{t("clients.isTaxpayer")}</Label>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("clients.notes")}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={values.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
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
