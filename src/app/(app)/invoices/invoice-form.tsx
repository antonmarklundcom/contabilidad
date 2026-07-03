"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { computeInvoiceTotals, computeLineAmounts } from "@/lib/money";
import { saveDraftAction, emitInvoiceAction } from "./actions";
import type { InvoiceInput, InvoiceLineInput } from "@/lib/validators";
import { ClientFormDialog } from "../clients/client-form";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClientOption {
  id: string;
  razonSocial: string;
  displayDoc: string;
  email: string | null;
}

export interface ProductOption {
  id: string;
  codigo: string;
  descripcion: string;
  precioUnitario: number;
  moneda: string;
  iva: number; // 10 | 5 | 0
  unidadMedida: number;
}

export interface PointOption {
  establecimiento: string;
  punto: string;
}

export interface MotivoOption {
  codigo: number;
  descripcion: string;
}

interface LineState extends InvoiceLineInput {
  key: number;
}

export interface InvoiceFormInitial {
  id?: string;
  clientId?: string;
  tipoDocumento?: number;
  establecimiento?: string;
  punto?: string;
  issueDate?: string;
  moneda?: "PYG" | "USD";
  exchangeRate?: number;
  condicionVenta?: number;
  creditPlazo?: string;
  creditCuotas?: number;
  descripcion?: string;
  observacion?: string;
  originalInvoiceId?: string;
  originalLabel?: string;
  motivoNota?: number;
  lines?: InvoiceLineInput[];
}

let keyCounter = 1;
const newKey = () => keyCounter++;

function emptyLine(): LineState {
  return {
    key: newKey(),
    productId: "",
    codigo: "",
    descripcion: "",
    unidadMedida: 77,
    cantidad: 1,
    precioUnitario: 0,
    descuento: 0,
    iva: 10,
  };
}

export function InvoiceForm({
  clients: initialClients,
  products,
  points,
  motivos,
  initial,
}: {
  clients: ClientOption[];
  products: ProductOption[];
  points: PointOption[];
  motivos: MotivoOption[];
  initial?: InvoiceFormInitial;
}) {
  const { t, money } = useI18n();
  const router = useRouter();

  const [clients, setClients] = useState(initialClients);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const tipoDocumento = initial?.tipoDocumento ?? 1;
  const [pointIdx, setPointIdx] = useState(() => {
    const idx = points.findIndex(
      (p) => p.establecimiento === initial?.establecimiento && p.punto === initial?.punto
    );
    return idx >= 0 ? idx : 0;
  });
  const [issueDate, setIssueDate] = useState(
    initial?.issueDate ?? new Date().toISOString().slice(0, 10)
  );
  const [moneda, setMoneda] = useState<"PYG" | "USD">(initial?.moneda ?? "PYG");
  const [exchangeRate, setExchangeRate] = useState<number | "">(initial?.exchangeRate ?? "");
  const [condicionVenta, setCondicionVenta] = useState(initial?.condicionVenta ?? 1);
  const [creditPlazo, setCreditPlazo] = useState(initial?.creditPlazo ?? "30 días");
  const [creditCuotas, setCreditCuotas] = useState<number | "">(initial?.creditCuotas ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [observacion, setObservacion] = useState(initial?.observacion ?? "");
  const [motivoNota, setMotivoNota] = useState(initial?.motivoNota ?? 1);
  const [lines, setLines] = useState<LineState[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({ ...l, key: newKey() }))
      : [emptyLine()]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "emit" | null>(null);
  const [confirmEmit, setConfirmEmit] = useState(false);

  const isNota = tipoDocumento === 5 || tipoDocumento === 6;
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const filteredClients = clientQuery
    ? clients.filter(
        (c) =>
          c.razonSocial.toLowerCase().includes(clientQuery.toLowerCase()) ||
          c.displayDoc.toLowerCase().includes(clientQuery.toLowerCase())
      )
    : clients;

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({
          cantidad: Number(l.cantidad) || 0,
          precioUnitario: Number(l.precioUnitario) || 0,
          descuento: Number(l.descuento) || 0,
          iva: l.iva,
        })),
        moneda
      ),
    [lines, moneda]
  );

  function setLine(key: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLine(key, {
      productId: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      precioUnitario: p.precioUnitario,
      iva: p.iva,
      unidadMedida: p.unidadMedida,
    });
  }

  function buildInput(): InvoiceInput {
    const point = points[pointIdx] ?? points[0];
    return {
      clientId,
      tipoDocumento,
      establecimiento: point?.establecimiento ?? "001",
      punto: point?.punto ?? "001",
      issueDate: new Date(`${issueDate}T${new Date().toTimeString().slice(0, 8)}`),
      moneda,
      exchangeRate: moneda === "PYG" ? undefined : Number(exchangeRate) || undefined,
      condicionVenta,
      creditPlazo,
      creditCuotas: creditCuotas === "" ? undefined : Number(creditCuotas),
      descripcion,
      observacion,
      originalInvoiceId: initial?.originalInvoiceId ?? "",
      motivoNota: isNota ? motivoNota : undefined,
      lines: lines.map(({ key: _key, ...rest }) => rest),
    };
  }

  async function submit(mode: "draft" | "emit") {
    setBusy(mode);
    setErrors({});
    setFormError(null);
    const action = mode === "draft" ? saveDraftAction : emitInvoiceAction;
    const res = await action(initial?.id ?? null, buildInput());
    setBusy(null);
    setConfirmEmit(false);
    if (res.ok && res.data) {
      router.push(`/invoices/${res.data.id}`);
      router.refresh();
    } else if (!res.ok) {
      if (res.errors) setErrors(res.errors);
      setFormError(res.error === "validation" ? null : res.error);
    }
  }

  const lineErrors = Object.keys(errors).some((k) => k.startsWith("lines"));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_290px]">
      <div className="space-y-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {t(`invoices.type_${tipoDocumento}`)}
              {initial?.originalLabel && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {t("invoices.originalDoc")}: {initial.originalLabel}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Client combobox */}
            <div className="relative space-y-1.5 sm:col-span-2">
              <Label>{t("invoices.client")}</Label>
              <button
                type="button"
                onClick={() => setClientOpen((o) => !o)}
                className={cn(
                  "flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 text-sm shadow-sm",
                  !selectedClient && "text-muted-foreground"
                )}
              >
                {selectedClient
                  ? `${selectedClient.razonSocial} · ${selectedClient.displayDoc}`
                  : t("invoices.selectClient")}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {errors["clientId"] && (
                <p className="text-xs text-destructive">{t("common.required")}</p>
              )}
              {clientOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                  <Input
                    autoFocus
                    placeholder={t("common.search")}
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    className="mb-1"
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setClientId(c.id);
                          setClientOpen(false);
                          setClientQuery("");
                        }}
                      >
                        <span>{c.razonSocial}</span>
                        <span className="text-xs text-muted-foreground">{c.displayDoc}</span>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <p className="px-2 py-2 text-sm text-muted-foreground">
                        {t("common.noResults")}
                      </p>
                    )}
                  </div>
                  <div className="border-t pt-1">
                    <button
                      type="button"
                      className="w-full rounded-sm px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent"
                      onClick={() => {
                        setClientOpen(false);
                        setNewClientOpen(true);
                      }}
                    >
                      {t("invoices.newClientInline")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha">{t("invoices.issueDate")}</Label>
              <Input
                id="fecha"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>

            {points.length > 1 ? (
              <div className="space-y-1.5">
                <Label>{t("settings.expeditionPoint")}</Label>
                <Select value={String(pointIdx)} onValueChange={(v) => setPointIdx(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {points.map((p, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {p.establecimiento}-{p.punto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("settings.expeditionPoint")}</Label>
                <Input
                  disabled
                  value={`${points[0]?.establecimiento ?? "001"}-${points[0]?.punto ?? "001"}`}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("invoices.condicion")}</Label>
              <Select
                value={String(condicionVenta)}
                onValueChange={(v) => setCondicionVenta(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("invoices.contado")}</SelectItem>
                  <SelectItem value="2">{t("invoices.credito")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {condicionVenta === 2 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="plazo">{t("invoices.creditoPlazo")}</Label>
                  <Input
                    id="plazo"
                    value={creditPlazo}
                    onChange={(e) => setCreditPlazo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cuotas">{t("invoices.creditoCuotas")}</Label>
                  <Input
                    id="cuotas"
                    type="number"
                    min={1}
                    value={creditCuotas}
                    onChange={(e) =>
                      setCreditCuotas(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>{t("common.currency")}</Label>
              <Select value={moneda} onValueChange={(v) => setMoneda(v as "PYG" | "USD")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PYG">PYG — Guaraní</SelectItem>
                  <SelectItem value="USD">USD — Dólar</SelectItem>
                </SelectContent>
              </Select>
              {moneda === "PYG" && (
                <p className="text-xs text-muted-foreground">{t("invoices.pygNoDecimals")}</p>
              )}
            </div>

            {moneda !== "PYG" && (
              <div className="space-y-1.5">
                <Label htmlFor="tc">{t("invoices.exchangeRate")}</Label>
                <Input
                  id="tc"
                  type="number"
                  min={0}
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) =>
                    setExchangeRate(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="text-right tabular-nums"
                />
                {errors["exchangeRate"] && (
                  <p className="text-xs text-destructive">
                    {t("invoices.exchangeRateRequired")}
                  </p>
                )}
              </div>
            )}

            {isNota && (
              <div className="space-y-1.5">
                <Label>{t("invoices.motivoNota")}</Label>
                <Select
                  value={String(motivoNota)}
                  onValueChange={(v) => setMotivoNota(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {motivos.map((m) => (
                      <SelectItem key={m.codigo} value={String(m.codigo)}>
                        {m.descripcion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Lines ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t("invoices.lines")}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus /> {t("invoices.addLine")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineErrors && (
              <p className="text-sm text-destructive">{t("invoices.invalidLines")}</p>
            )}
            {lines.map((line, idx) => {
              const amounts = computeLineAmounts(
                {
                  cantidad: Number(line.cantidad) || 0,
                  precioUnitario: Number(line.precioUnitario) || 0,
                  descuento: Number(line.descuento) || 0,
                  iva: line.iva,
                },
                moneda
              );
              return (
                <div key={line.key} className="rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-4">
                      <Label className="text-xs">{t("invoices.product")}</Label>
                      <Select
                        value={line.productId || "free"}
                        onValueChange={(v) =>
                          v === "free"
                            ? setLine(line.key, { productId: "" })
                            : pickProduct(line.key, v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">{t("invoices.freeTextLine")}</SelectItem>
                          {products
                            .filter((p) => p.moneda === moneda)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.codigo} — {p.descripcion}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-8">
                      <Label className="text-xs">{t("invoices.description")}</Label>
                      <Input
                        value={line.descripcion}
                        onChange={(e) => setLine(line.key, { descripcion: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">{t("invoices.qty")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.cantidad || ""}
                        onChange={(e) => setLine(line.key, { cantidad: Number(e.target.value) })}
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">{t("invoices.unitPrice")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={moneda === "PYG" ? 1 : 0.01}
                        value={line.precioUnitario || ""}
                        onChange={(e) =>
                          setLine(line.key, { precioUnitario: Number(e.target.value) })
                        }
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">{t("invoices.discount")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={moneda === "PYG" ? 1 : 0.01}
                        value={line.descuento || ""}
                        onChange={(e) => setLine(line.key, { descuento: Number(e.target.value) })}
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">{t("invoices.ivaRate")}</Label>
                      <Select
                        value={String(line.iva)}
                        onValueChange={(v) => setLine(line.key, { iva: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="0">{t("products.exenta")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-between gap-2 sm:col-span-2">
                      <div className="flex-1 text-right">
                        <p className="text-xs text-muted-foreground">{t("invoices.lineTotal")}</p>
                        <p className="text-sm font-medium tabular-nums">
                          {money(amounts.lineTotal, moneda)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Extra text ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="grid gap-4 pt-5">
            <div className="space-y-1.5">
              <Label htmlFor="descripcion">{t("invoices.descripcionField")}</Label>
              <Input
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observacion">
                {t("invoices.observacion")}{" "}
                <span className="text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Textarea
                id="observacion"
                rows={2}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Totals panel ─────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("invoices.totals")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["invoices.gravada10", totals.gravada10],
              ["invoices.gravada5", totals.gravada5],
              ["invoices.exenta", totals.exenta],
              ["invoices.iva10", totals.iva10],
              ["invoices.iva5", totals.iva5],
              ["invoices.totalIva", totals.totalIva],
            ].map(([key, value]) => (
              <div key={key as string} className="flex justify-between">
                <span className="text-muted-foreground">{t(key as string)}</span>
                <span className="tabular-nums">{money(value as number, moneda)}</span>
              </div>
            ))}
            {totals.totalDescuento > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("invoices.totalDiscount")}</span>
                <span className="tabular-nums">−{money(totals.totalDescuento, moneda)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>{t("invoices.grandTotal")}</span>
              <span className="tabular-nums">{money(totals.total, moneda)}</span>
            </div>
          </CardContent>
        </Card>

        {formError && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button
            size="lg"
            disabled={busy !== null || !clientId}
            onClick={() => setConfirmEmit(true)}
          >
            {busy === "emit" ? t("invoices.emitting") : t("invoices.emit")}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => submit("draft")}
          >
            {busy === "draft" ? t("common.saving") : t("invoices.draft")}
          </Button>
        </div>
      </div>

      <ClientFormDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onSaved={(id, razonSocial) => {
          setClients((cs) => [
            { id, razonSocial, displayDoc: "", email: null },
            ...cs,
          ]);
          setClientId(id);
        }}
      />

      <Dialog open={confirmEmit} onOpenChange={setConfirmEmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.emitConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("invoices.emitConfirmBody")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span>{selectedClient?.razonSocial}</span>
              <span className="font-semibold tabular-nums">{money(totals.total, moneda)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEmit(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy !== null} onClick={() => submit("emit")}>
              {busy === "emit" ? t("invoices.emitting") : t("invoices.emit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
