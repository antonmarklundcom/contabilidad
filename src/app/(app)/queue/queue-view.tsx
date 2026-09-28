"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { switchCompany } from "../actions";
import type { ExpenseReason } from "@/lib/review-queue";

interface Item {
  id: string;
  companyId: string;
  companyName: string;
  reasons: ExpenseReason[];
  supplier: string | null;
  numeroComprobante: string | null;
  fecha: string | null;
  total: number;
  moneda: string;
  supplierEstado: string | null;
}

interface BoardRow {
  companyId: string;
  companyName: string;
  ruc: string;
  openItems: number;
  deadlineAttention: boolean;
  deadline: {
    dueDate: string;
    daysRemaining: number;
    overdue: boolean;
    status: string;
    period: string;
  } | null;
}

const REASON_VARIANT: Record<ExpenseReason, "destructive" | "warning" | "info" | "muted"> = {
  CDC_MISMATCH: "destructive",
  INACTIVE_SUPPLIER: "destructive",
  DUPLICATE_SUSPECT: "warning",
  LOW_CONFIDENCE: "warning",
  NEEDS_REVIEW: "muted",
};

/**
 * Keyboard: j / k move, Enter opens. Opening switches into the item's
 * company first (server-checked membership), then navigates to the normal
 * screen — the queue itself never changes a record.
 */
export function QueueView({
  items,
  board,
  truncated,
}: {
  items: Item[];
  board: BoardRow[];
  truncated: boolean;
}) {
  const { t, money, date } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);

  const open = useCallback(
    async (companyId: string, href: string) => {
      setBusy(true);
      const res = await switchCompany(companyId);
      setBusy(false);
      if (res.ok) router.push(href);
    },
    [router]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j") setSelected((s) => Math.min(s + 1, items.length - 1));
      else if (e.key === "k") setSelected((s) => Math.max(s - 1, 0));
      else if (e.key === "Enter" && items[selected]) {
        void open(items[selected].companyId, `/expenses/${items[selected].id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, open]);

  useEffect(() => {
    document.getElementById(`q-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("queue.board")}</h2>
        <div className="divide-y rounded-lg border bg-card text-sm">
          {board.map((b) => (
            <div key={b.companyId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {b.companyName} <span className="font-mono text-xs text-muted-foreground">{b.ruc}</span>
              </span>
              <Badge variant={b.openItems > 0 ? "warning" : "success"}>
                {t("queue.openItems", { count: b.openItems })}
              </Badge>
              {b.deadline ? (
                <span
                  className={cn(
                    "text-xs",
                    b.deadline.overdue
                      ? "font-semibold text-red-700"
                      : b.deadlineAttention
                        ? "text-amber-700"
                        : "text-muted-foreground"
                  )}
                >
                  {b.deadline.overdue
                    ? t("queue.overdue", { period: b.deadline.period })
                    : t("queue.dueIn", { period: b.deadline.period, days: b.deadline.daysRemaining })}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{t("queue.noDeadline")}</span>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void open(b.companyId, "/taxes")}>
                {t("queue.openTaxes")}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{t("queue.items", { count: items.length })}</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">{t("queue.keys")}</span>
        </div>
        {truncated && <p className="text-xs text-amber-700">{t("queue.truncated")}</p>}
        {items.length === 0 ? (
          <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            {t("queue.empty")}
          </p>
        ) : (
          <div className="divide-y rounded-lg border bg-card text-sm">
            {items.map((i, idx) => (
              <button
                key={i.id}
                id={`q-${idx}`}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelected(idx);
                  void open(i.companyId, `/expenses/${i.id}`);
                }}
                className={cn(
                  "flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-muted/50",
                  idx === selected && "bg-muted"
                )}
              >
                <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">{i.companyName}</span>
                <span className="min-w-0 flex-1 truncate">
                  {i.supplier ?? "—"} · {i.numeroComprobante ?? "—"}
                </span>
                <span className="flex flex-wrap gap-1">
                  {i.reasons.map((r) => (
                    <Badge key={r} variant={REASON_VARIANT[r]}>
                      {t(`queue.reasons.${r}`)}
                      {r === "INACTIVE_SUPPLIER" && i.supplierEstado ? `: ${i.supplierEstado}` : ""}
                    </Badge>
                  ))}
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground">{date(i.fecha)}</span>
                <span className="w-32 text-right tabular-nums">{money(i.total, i.moneda)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
