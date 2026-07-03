"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ProductFormDialog, type ProductFormValues, type UnitOption } from "./product-form";
import { deleteProduct } from "./actions";

export interface ProductRow extends ProductFormValues {
  id: string;
  unitLabel: string;
}

const IVA_LABEL: Record<string, string> = {
  IVA_10: "10%",
  IVA_5: "5%",
  EXENTA: "—",
};

export function ProductsTable({ products, units }: { products: ProductRow[]; units: UnitOption[] }) {
  const { t, money } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);

  async function onDelete(id: string) {
    await deleteProduct(id);
    router.refresh();
  }

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("products.code")}</TableHead>
              <TableHead>{t("invoices.description")}</TableHead>
              <TableHead>{t("products.type")}</TableHead>
              <TableHead>{t("products.unit")}</TableHead>
              <TableHead>{t("products.iva")}</TableHead>
              <TableHead className="text-right">{t("products.price")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} className={p.active ? "" : "opacity-50"}>
                <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                <TableCell className="font-medium">
                  {p.descripcionEs}
                  {!p.active && (
                    <Badge variant="muted" className="ml-2">
                      {t("products.inactive")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{t(`products.${p.tipo}`)}</TableCell>
                <TableCell className="text-muted-foreground">{p.unitLabel}</TableCell>
                <TableCell>{IVA_LABEL[p.ivaRate]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(p.precioUnitario, p.moneda)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t("common.actions")}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil /> {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => onDelete(p.id)}>
                        <Trash2 /> {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ProductFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        initial={editing}
        units={units}
      />
    </>
  );
}

export function NewProductButton({ units }: { units: UnitOption[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("products.new")}</Button>
      <ProductFormDialog open={open} onOpenChange={setOpen} units={units} />
    </>
  );
}
