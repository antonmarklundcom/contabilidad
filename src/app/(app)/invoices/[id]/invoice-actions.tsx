"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  duplicateInvoiceAction,
  cancelInvoiceAction,
  retrySendAction,
  sendInvoiceEmailAction,
} from "../actions";
import {
  Download,
  FileCode,
  MoreHorizontal,
  Mail,
  MessageCircle,
  Copy,
  FileMinus,
  Ban,
  Pencil,
  RefreshCw,
  Loader2,
} from "lucide-react";

export function InvoiceActions({
  invoiceId,
  status,
  fullNumber,
  clientEmail,
  clientPhone,
  hasKude,
  hasXml,
  canCancel,
  total,
  companyMode,
}: {
  invoiceId: string;
  status: string;
  fullNumber: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  hasKude: boolean;
  hasXml: boolean;
  canCancel: boolean;
  total: string;
  companyMode: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail ?? "");
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const waText = encodeURIComponent(
    `${t(`env.${companyMode}`) === "PRODUCCIÓN" || companyMode === "production" ? "" : `[${t(`env.${companyMode}`)}] `}` +
      `${t("invoices.type_1")} ${fullNumber ?? ""} — ${total}`
  );
  const waHref = clientPhone
    ? `https://wa.me/${clientPhone.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  async function doDuplicate(asCreditNote: boolean) {
    setBusy(true);
    const res = await duplicateInvoiceAction(invoiceId, { asCreditNote });
    setBusy(false);
    if (res.ok && res.data) router.push(`/invoices/${res.data.id}/edit`);
  }

  async function doCancel() {
    setBusy(true);
    setMessage(null);
    const res = await cancelInvoiceAction(invoiceId, cancelReason);
    setBusy(false);
    if (res.ok) {
      setCancelOpen(false);
      router.refresh();
    } else {
      setMessage({ kind: "error", text: res.error });
    }
  }

  async function doRetry() {
    setBusy(true);
    await retrySendAction(invoiceId);
    setBusy(false);
    router.refresh();
  }

  async function doEmail() {
    setBusy(true);
    setMessage(null);
    const res = await sendInvoiceEmailAction(invoiceId, emailTo);
    setBusy(false);
    if (res.ok) {
      setEmailOpen(false);
      setMessage({ kind: "ok", text: t("invoices.emailSent", { email: emailTo }) });
    } else {
      setMessage({
        kind: "error",
        text: res.error === "no_smtp" ? t("invoices.emailNoSmtp") : t("invoices.emailFailed"),
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && (
        <p
          className={
            message.kind === "ok" ? "text-sm text-emerald-700" : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {status === "DRAFT" && (
        <Button asChild>
          <Link href={`/invoices/${invoiceId}/edit`}>
            <Pencil /> {t("common.edit")}
          </Link>
        </Button>
      )}

      {status === "REJECTED" && (
        <Button onClick={() => doDuplicate(false)} disabled={busy}>
          <RefreshCw /> {t("invoices.correctAndResend")}
        </Button>
      )}

      {(status === "CONTINGENCY" || status === "QUEUED" || status === "SENT") && (
        <Button onClick={doRetry} disabled={busy} variant="outline">
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("invoices.retryNow")}
        </Button>
      )}

      {hasKude && (
        <Button variant="outline" asChild>
          <a href={`/api/invoices/${invoiceId}/kude`}>
            <Download /> {t("invoices.downloadKude")}
          </a>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t("common.actions")}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {hasXml && (
            <DropdownMenuItem asChild>
              <a href={`/api/invoices/${invoiceId}/xml`}>
                <FileCode /> {t("invoices.downloadXml")}
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setWhatsAppOpen(true)} disabled={!hasKude}>
            <MessageCircle /> {t("invoices.sendWhatsApp")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEmailOpen(true)} disabled={!hasKude}>
            <Mail /> {t("invoices.sendEmail")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => doDuplicate(false)}>
            <Copy /> {t("invoices.duplicate")}
          </DropdownMenuItem>
          {status === "APPROVED" && (
            <DropdownMenuItem onClick={() => doDuplicate(true)}>
              <FileMinus /> {t("invoices.createCreditNote")}
            </DropdownMenuItem>
          )}
          {status === "APPROVED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={!canCancel}
                onClick={() => setCancelOpen(true)}
              >
                <Ban /> {t("invoices.cancelDoc")}
              </DropdownMenuItem>
              {!canCancel && (
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {t("invoices.cancelWindowExpired")}
                </p>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.cancelDoc")}</DialogTitle>
            <DialogDescription>
              {t("invoices.cancelWindow")} {t("invoices.cancelConfirm")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">{t("invoices.cancelReason")}</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          {message?.kind === "error" && (
            <p className="text-sm text-destructive">{message.text}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || cancelReason.trim().length < 5}
              onClick={doCancel}
            >
              {busy ? t("common.loading") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.sendEmail")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="email-to">{t("clients.email")}</Label>
            <Input
              id="email-to"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !emailTo} onClick={doEmail}>
              {busy ? t("common.loading") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp dialog — honest about manual attachment */}
      <Dialog open={whatsAppOpen} onOpenChange={setWhatsAppOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.sendWhatsApp")}</DialogTitle>
            <DialogDescription>{t("invoices.whatsAppNote")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" asChild>
              <a href={`/api/invoices/${invoiceId}/kude`}>
                <Download /> {t("invoices.downloadKude")}
              </a>
            </Button>
            <Button asChild>
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
