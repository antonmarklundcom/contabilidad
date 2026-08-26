"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Copy, Link2, AlertTriangle } from "lucide-react";
import { createInvoiceLinkAction } from "./actions";

/**
 * Mints a one-time emission link (PLAN Phase 8.1).
 *
 * The generated URL is shown once and never again: only its keyed HMAC is
 * stored, so nobody — us included — can recover it afterwards. The dialog
 * says so plainly rather than letting the operator assume they can come back
 * for it.
 */
export function InvoiceLinkDialog({
  establecimiento,
  punto,
  ttlMinutes,
}: {
  establecimiento: string;
  punto: string;
  ttlMinutes: number;
}) {
  const { t, dateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createInvoiceLinkAction({ establecimiento, punto, note });
    setBusy(false);
    if (!res.ok) {
      setError(res.error === "no_point" ? "no_point" : "failed");
      return;
    }
    // The origin is the browser's — the server never needs to guess a
    // public hostname, which is also what keeps this working after the
    // Phase 9 domain split.
    setResult({
      url: `${window.location.origin}${res.data!.path}`,
      expiresAt: res.data!.expiresAt,
    });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      // Clipboard denied (insecure context, permissions): the input below
      // still holds the URL for a manual copy, so this is not an error.
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Nothing about a spent dialog should linger — least of all the token.
      setResult(null);
      setNote("");
      setError(null);
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 /> {t("invoiceLink.create.action")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invoiceLink.create.title")}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{t("invoiceLink.create.onceWarning")}</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? t("invoiceLink.create.copied") : t("invoiceLink.create.copy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("invoiceLink.create.expiresAt", {
                date: dateTime(new Date(result.expiresAt)),
              })}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("invoiceLink.create.description", { minutes: ttlMinutes })}
            </p>
            <div>
              <Label htmlFor="linkNote">{t("invoiceLink.create.note")}</Label>
              <Input
                id="linkNote"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>
                  {t(
                    error === "no_point"
                      ? "invoiceLink.create.noPoint"
                      : "invoiceLink.create.failed"
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={busy}>
              {t("invoiceLink.create.submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
