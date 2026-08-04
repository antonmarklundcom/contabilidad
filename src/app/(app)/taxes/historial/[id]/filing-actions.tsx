"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send, BadgeCheck, Upload, FileCheck2, Save } from "lucide-react";
import { markSubmittedAction, markPaidAction, saveFilingNotesAction } from "../../actions";

/**
 * Filing lifecycle controls: mark submitted, mark paid, attach the DNIT
 * receipt PDF and keep a note. Colocated client component; every mutation goes
 * through a zod-validated, audited server action (the upload posts to its own
 * route because a File cannot cross a server action boundary here).
 */
export function FilingActions({
  filingId,
  status,
  hasReceipt,
  notes,
}: {
  filingId: string;
  status: string;
  hasReceipt: boolean;
  notes: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState(notes);
  const [noteSaved, setNoteSaved] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(t(`taxes.history.error.${res.error ?? "invalid"}`));
      return;
    }
    router.refresh();
  }

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/filings/${filingId}/pdf`, { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(t(`taxes.history.error.${data.error ?? "invalid"}`));
      return;
    }
    router.refresh();
  }

  async function onSaveNotes() {
    setBusy(true);
    setError(null);
    const res = await saveFilingNotesAction({ filingId, notes: noteValue });
    setBusy(false);
    if (!res.ok) {
      setError(t(`taxes.history.error.${res.error ?? "invalid"}`));
      return;
    }
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("taxes.history.actions")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || status === "SUBMITTED" || status === "DRAFT"}
            onClick={() => run(() => markSubmittedAction({ filingId }))}
          >
            <Send /> {t("taxes.history.markSubmitted")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || status === "PAID" || status === "DRAFT"}
            onClick={() => run(() => markPaidAction({ filingId }))}
          >
            <BadgeCheck /> {t("taxes.history.markPaid")}
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload />
            {hasReceipt ? t("taxes.history.replaceReceipt") : t("taxes.history.uploadReceipt")}
          </Button>

          {hasReceipt && (
            <Button variant="ghost" asChild>
              <a href={`/api/filings/${filingId}/pdf`} target="_blank" rel="noreferrer">
                <FileCheck2 /> {t("taxes.history.viewReceipt")}
              </a>
            </Button>
          )}
        </div>

        {status === "DRAFT" && (
          <p className="text-xs text-muted-foreground">{t("taxes.history.closeFirstHint")}</p>
        )}
        {hasReceipt && (
          <p className="text-xs text-muted-foreground">{t("taxes.history.replaceReceiptHint")}</p>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="filing-notes">
            {t("taxes.history.notes")}
          </label>
          <Textarea
            id="filing-notes"
            rows={3}
            value={noteValue}
            maxLength={2000}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder={t("taxes.history.notesPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onSaveNotes}>
              <Save /> {t("common.save")}
            </Button>
            {noteSaved && <span className="text-xs text-emerald-600">{t("taxes.saved")}</span>}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
