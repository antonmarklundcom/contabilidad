"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FileCheck2, AlertTriangle } from "lucide-react";
import { computeInvoiceTotals } from "@/lib/money";
import { redeemInvoiceLinkAction, type RedeemError } from "./actions";

type DocType = "RUC" | "CI" | "INNOMINADO";

interface LineDraft {
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  iva: string;
}

const emptyLine = (): LineDraft => ({
  descripcion: "",
  cantidad: "1",
  precioUnitario: "",
  iva: "10",
});

/**
 * The anonymous emission form.
 *
 * Only the buyer and the lines: the company, document type, expedition point
 * and currency live on the stored link and are never posted from here — a
 * hidden field the caller controls would be a hole, not a convenience.
 *
 * The running total is computed with the SAME `computeInvoiceTotals` the
 * server uses, so the figure on screen is the figure that gets emitted rather
 * than a second implementation that can drift.
 */
export function RedeemForm({
  token,
  moneda,
  numberLocale,
}: {
  token: string;
  moneda: string;
  numberLocale: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [docType, setDocType] = useState<DocType>("RUC");
  const [ruc, setRuc] = useState("");
  const [dv, setDv] = useState("");
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [email, setEmail] = useState("");
  const [condicionVenta, setCondicionVenta] = useState("1");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RedeemError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const total = useMemo(() => {
    const totals = computeInvoiceTotals(
      lines.map((l) => ({
        cantidad: Number(l.cantidad) || 0,
        precioUnitario: Number(l.precioUnitario) || 0,
        descuento: 0,
        iva: Number(l.iva),
      })),
      moneda
    );
    return totals.total;
  }, [lines, moneda]);

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const res = await redeemInvoiceLinkAction(token, {
      docType,
      ruc: docType === "RUC" ? ruc : "",
      dv: docType === "RUC" ? dv : "",
      documentoNumero: docType === "CI" ? documentoNumero : "",
      razonSocial,
      email,
      condicionVenta: Number(condicionVenta),
      lines: lines.map((l) => ({
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad) || 0,
        precioUnitario: Number(l.precioUnitario) || 0,
        descuento: 0,
        iva: Number(l.iva),
        unidadMedida: 77,
      })),
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setFieldErrors(res.errors ?? {});
      // A link that turned out to be spent or expired has a different page to
      // show; re-rendering the server component is what decides that.
      if (res.error !== "validation" && res.error !== "emit_failed") router.refresh();
      return;
    }
    router.refresh();
  }

  const errorMessage = () => {
    if (error === "emit_failed") return t("invoiceLink.errorEmit");
    if (error === "validation") return t("invoiceLink.errorValidation");
    return null;
  };

  const fieldHint = (key: string) => {
    const code = fieldErrors[key];
    if (!code) return null;
    const text =
      code === "dv_mismatch"
        ? t("invoiceLink.errorDv")
        : code === "pyg_no_decimals"
          ? t("invoiceLink.errorPygDecimals")
          : t("invoiceLink.errorRequired");
    return <p className="mt-1 text-xs text-destructive">{text}</p>;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("invoiceLink.buyerSection")}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="docType">{t("invoiceLink.docType")}</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger id="docType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RUC">{t("invoiceLink.docTypeRUC")}</SelectItem>
                <SelectItem value="CI">{t("invoiceLink.docTypeCI")}</SelectItem>
                <SelectItem value="INNOMINADO">
                  {t("invoiceLink.docTypeINNOMINADO")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {docType === "RUC" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="ruc">{t("invoiceLink.ruc")}</Label>
                <Input
                  id="ruc"
                  inputMode="numeric"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                />
                {fieldHint("ruc")}
              </div>
              <div className="w-20">
                <Label htmlFor="dv">{t("invoiceLink.dv")}</Label>
                <Input
                  id="dv"
                  inputMode="numeric"
                  maxLength={1}
                  value={dv}
                  onChange={(e) => setDv(e.target.value)}
                />
                {fieldHint("dv")}
              </div>
            </div>
          )}

          {docType === "CI" && (
            <div>
              <Label htmlFor="documentoNumero">{t("invoiceLink.documentoNumero")}</Label>
              <Input
                id="documentoNumero"
                inputMode="numeric"
                value={documentoNumero}
                onChange={(e) => setDocumentoNumero(e.target.value)}
              />
              {fieldHint("documentoNumero")}
            </div>
          )}

          <div>
            <Label htmlFor="razonSocial">{t("invoiceLink.razonSocial")}</Label>
            <Input
              id="razonSocial"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              required
            />
            {fieldHint("razonSocial")}
          </div>

          <div>
            <Label htmlFor="email">{t("invoiceLink.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldHint("email")}
          </div>

          <div>
            <Label htmlFor="condicionVenta">{t("invoiceLink.condicionVenta")}</Label>
            <Select value={condicionVenta} onValueChange={setCondicionVenta}>
              <SelectTrigger id="condicionVenta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("invoiceLink.contado")}</SelectItem>
                <SelectItem value="2">{t("invoiceLink.credito")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("invoiceLink.linesSection")}</h2>

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <Label htmlFor={`d${i}`}>{t("invoiceLink.descripcion")}</Label>
                <Input
                  id={`d${i}`}
                  value={line.descripcion}
                  onChange={(e) => setLine(i, { descripcion: e.target.value })}
                  required
                />
                {fieldHint(`lines.${i}.descripcion`)}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`c${i}`}>{t("invoiceLink.cantidad")}</Label>
                <Input
                  id={`c${i}`}
                  inputMode="decimal"
                  value={line.cantidad}
                  onChange={(e) => setLine(i, { cantidad: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor={`p${i}`}>{t("invoiceLink.precioUnitario")}</Label>
                <Input
                  id={`p${i}`}
                  inputMode="numeric"
                  // PYG has no decimals — the server enforces it too.
                  step={moneda === "PYG" ? 1 : 0.01}
                  type="number"
                  value={line.precioUnitario}
                  onChange={(e) => setLine(i, { precioUnitario: e.target.value })}
                  required
                />
                {fieldHint(`lines.${i}.precioUnitario`)}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={`i${i}`}>{t("invoiceLink.iva")}</Label>
                <Select value={line.iva} onValueChange={(v) => setLine(i, { iva: v })}>
                  <SelectTrigger id={`i${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t("invoiceLink.iva10")}</SelectItem>
                    <SelectItem value="5">{t("invoiceLink.iva5")}</SelectItem>
                    <SelectItem value="0">{t("invoiceLink.iva0")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {lines.length > 1 && (
                <div className="sm:col-span-12">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 /> {t("invoiceLink.removeLine")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 50 is the server's cap; the button disappearing beats a rejection. */}
        {lines.length < 50 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus /> {t("invoiceLink.addLine")}
          </Button>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("invoiceLink.total")}: </span>
          <span className="font-semibold tabular-nums">
            {new Intl.NumberFormat(numberLocale, {
              maximumFractionDigits: moneda === "PYG" ? 0 : 2,
            }).format(total)}{" "}
            {moneda}
          </span>
        </div>
        <Button type="submit" disabled={busy}>
          <FileCheck2 /> {busy ? t("invoiceLink.submitting") : t("invoiceLink.submit")}
        </Button>
      </div>

      {errorMessage() && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertDescription>{errorMessage()}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
