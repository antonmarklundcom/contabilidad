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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, FileText } from "lucide-react";
import Link from "next/link";
import { ClientFormDialog, type ClientFormValues } from "./client-form";
import { deleteClient } from "./actions";

export interface ClientRow extends ClientFormValues {
  id: string;
  invoiceCount: number;
  displayDoc: string;
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onDelete(id: string) {
    setDeleteError(null);
    const res = await deleteClient(id);
    if (!res.ok) setDeleteError(t("clients.deleteBlocked"));
    else router.refresh();
  }

  return (
    <>
      {deleteError && <p className="mb-2 text-sm text-destructive">{deleteError}</p>}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("clients.razonSocial")}</TableHead>
              <TableHead>{t("clients.docType")}</TableHead>
              <TableHead>{t("clients.email")}</TableHead>
              <TableHead>{t("clients.phone")}</TableHead>
              <TableHead className="text-right">{t("clients.invoiceCount")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.razonSocial}</TableCell>
                <TableCell className="text-muted-foreground">{c.displayDoc}</TableCell>
                <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.telefono || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.invoiceCount}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t("common.actions")}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(c)}>
                        <Pencil /> {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/invoices/new?clientId=${c.id}`}>
                          <FileText /> {t("invoices.new")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        disabled={c.invoiceCount > 0}
                        onClick={() => onDelete(c.id)}
                      >
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
      <ClientFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        initial={editing}
      />
    </>
  );
}

export function NewClientButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("clients.new")}</Button>
      <ClientFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
