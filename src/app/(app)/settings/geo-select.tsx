"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GeoItem {
  codigo: number;
  descripcion: string;
}

export interface GeoValue {
  departamento: number;
  departamentoDescripcion: string;
  distrito: number;
  distritoDescripcion: string;
  ciudad: number;
  ciudadDescripcion: string;
}

async function fetchGeo(level: string, parent?: number): Promise<GeoItem[]> {
  const res = await fetch(`/api/catalog/geo?level=${level}${parent ? `&parent=${parent}` : ""}`);
  return res.ok ? res.json() : [];
}

export function GeoSelect({
  departamento,
  distrito,
  ciudad,
  onChange,
}: {
  departamento: number;
  distrito: number;
  ciudad: number;
  onChange: (v: GeoValue) => void;
}) {
  const { t } = useI18n();
  const [deps, setDeps] = useState<GeoItem[]>([]);
  const [dists, setDists] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);

  useEffect(() => {
    fetchGeo("departamento").then(setDeps);
  }, []);
  useEffect(() => {
    if (departamento) fetchGeo("distrito", departamento).then(setDists);
  }, [departamento]);
  useEffect(() => {
    if (distrito) fetchGeo("ciudad", distrito).then(setCities);
  }, [distrito]);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>{t("settings.departamento")}</Label>
        <Select
          value={String(departamento)}
          onValueChange={(val) => {
            const item = deps.find((d) => d.codigo === Number(val));
            if (item) {
              onChange({
                departamento: item.codigo,
                departamentoDescripcion: item.descripcion,
                distrito: 0,
                distritoDescripcion: "",
                ciudad: 0,
                ciudadDescripcion: "",
              });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {deps.map((d) => (
              <SelectItem key={d.codigo} value={String(d.codigo)}>
                {d.descripcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("settings.distrito")}</Label>
        <Select
          value={String(distrito)}
          onValueChange={(val) => {
            const item = dists.find((d) => d.codigo === Number(val));
            const dep = deps.find((d) => d.codigo === departamento);
            if (item) {
              onChange({
                departamento,
                departamentoDescripcion: dep?.descripcion ?? "",
                distrito: item.codigo,
                distritoDescripcion: item.descripcion,
                ciudad: 0,
                ciudadDescripcion: "",
              });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dists.map((d) => (
              <SelectItem key={d.codigo} value={String(d.codigo)}>
                {d.descripcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("settings.ciudad")}</Label>
        <Select
          value={String(ciudad)}
          onValueChange={(val) => {
            const item = cities.find((c) => c.codigo === Number(val));
            const dep = deps.find((d) => d.codigo === departamento);
            const dist = dists.find((d) => d.codigo === distrito);
            if (item) {
              onChange({
                departamento,
                departamentoDescripcion: dep?.descripcion ?? "",
                distrito,
                distritoDescripcion: dist?.descripcion ?? "",
                ciudad: item.codigo,
                ciudadDescripcion: item.descripcion,
              });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cities.map((c) => (
              <SelectItem key={c.codigo} value={String(c.codigo)}>
                {c.descripcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
