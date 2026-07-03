"use client";

import { useI18n } from "@/components/i18n-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LibroRow, LibroTotals } from "@/lib/accounting";

export function LibroTable({
  rows,
  totals,
  moneda = "PYG",
}: {
  rows: LibroRow[];
  totals: LibroTotals;
  moneda?: string;
}) {
  const { t, money, date } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {t("books.emptyMonth")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("books.fecha")}</TableHead>
            <TableHead>{t("books.tipo")}</TableHead>
            <TableHead>{t("books.numero")}</TableHead>
            <TableHead>{t("books.timbrado")}</TableHead>
            <TableHead>{t("books.ruc")}</TableHead>
            <TableHead>{t("books.razonSocial")}</TableHead>
            <TableHead className="text-right">{t("books.gravada10")}</TableHead>
            <TableHead className="text-right">{t("books.gravada5")}</TableHead>
            <TableHead className="text-right">{t("books.exentas")}</TableHead>
            <TableHead className="text-right">{t("books.iva10")}</TableHead>
            <TableHead className="text-right">{t("books.iva5")}</TableHead>
            <TableHead className="text-right">{t("books.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {date(r.fecha)}
              </TableCell>
              <TableCell className="whitespace-nowrap">{r.tipo}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">{r.numero}</TableCell>
              <TableCell className="font-mono text-xs">{r.timbrado}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">{r.ruc}</TableCell>
              <TableCell className="max-w-[16rem] truncate">{r.razonSocial}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.gravada10, moneda)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.gravada5, moneda)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.exenta, moneda)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.iva10, moneda)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.iva5, moneda)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {money(r.total, moneda)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={6} className="font-semibold">
              {t("books.totals")}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.gravada10, moneda)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.gravada5, moneda)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.exenta, moneda)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.iva10, moneda)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.iva5, moneda)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(totals.total, moneda)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
