"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoSelect } from "./geo-select";
import { saveCompany } from "./actions";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { Plus, Trash2 } from "lucide-react";

export interface CompanyValues {
  ruc: string;
  dv: string;
  razonSocial: string;
  nombreFantasia: string;
  timbradoNumero: string;
  timbradoFechaInicio: string;
  tipoContribuyente: number;
  tipoRegimen: number | null;
  direccion: string;
  numeroCasa: string;
  departamento: number;
  departamentoDescripcion: string;
  distrito: number;
  distritoDescripcion: string;
  ciudad: number;
  ciudadDescripcion: string;
  telefono: string;
  email: string;
  actividades: { codigo: string; descripcion: string }[];
}

export function CompanyForm({ initial }: { initial: CompanyValues }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState<CompanyValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CompanyValues>(key: K, value: CompanyValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await saveCompany(v);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.company")}</CardTitle>
        <CardDescription>{t("settings.companyHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.ruc")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={v.ruc}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setV((prev) => ({
                      ...prev,
                      ruc: clean,
                      dv: clean ? String(calcularDigitoVerificador(clean)) : "",
                    }));
                    setSaved(false);
                  }}
                  className="flex-1"
                />
                <span className="text-muted-foreground">-</span>
                <Input value={v.dv} readOnly className="w-12 text-center" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.razonSocial")}</Label>
              <Input value={v.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.nombreFantasia")}</Label>
              <Input value={v.nombreFantasia} onChange={(e) => set("nombreFantasia", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t("settings.timbrado")}</Label>
                <Input value={v.timbradoNumero} onChange={(e) => set("timbradoNumero", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.timbradoDate")}</Label>
                <Input
                  type="date"
                  value={v.timbradoFechaInicio}
                  onChange={(e) => set("timbradoFechaInicio", e.target.value)}
                />
              </div>
            </div>
          </div>

          <GeoSelect
            departamento={v.departamento}
            distrito={v.distrito}
            ciudad={v.ciudad}
            onChange={(g) =>
              setV((prev) => ({
                ...prev,
                departamento: g.departamento,
                departamentoDescripcion: g.departamentoDescripcion,
                distrito: g.distrito,
                distritoDescripcion: g.distritoDescripcion,
                ciudad: g.ciudad,
                ciudadDescripcion: g.ciudadDescripcion,
              }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.address")}</Label>
              <Input value={v.direccion} onChange={(e) => set("direccion", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.numeroCasa")}</Label>
              <Input value={v.numeroCasa} onChange={(e) => set("numeroCasa", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("settings.phone")}</Label>
              <Input value={v.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.email")}</Label>
              <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          {/* Actividades económicas */}
          <div className="space-y-2">
            <Label>{t("settings.actividades")}</Label>
            {v.actividades.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder={t("settings.actividadCodigo")}
                  value={a.codigo}
                  onChange={(e) => {
                    const next = [...v.actividades];
                    next[i] = { ...next[i], codigo: e.target.value };
                    set("actividades", next);
                  }}
                  className="w-28"
                />
                <Input
                  placeholder={t("settings.actividadDescripcion")}
                  value={a.descripcion}
                  onChange={(e) => {
                    const next = [...v.actividades];
                    next[i] = { ...next[i], descripcion: e.target.value };
                    set("actividades", next);
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => set("actividades", v.actividades.filter((_, j) => j !== i))}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set("actividades", [...v.actividades, { codigo: "", descripcion: "" }])}
            >
              <Plus /> {t("settings.addActividad")}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
            {saved && <span className="text-sm text-emerald-700">{t("settings.savedOk")}</span>}
            {error && <span className="text-sm text-destructive">{t("common.error")}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
