"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";

const KINDS = [
  "BANK_STATEMENT",
  "DNIT_NOTICE",
  "CONTRACT",
  "CERTIFICATE",
  "FILING",
  "OTHER",
] as const;

export function UploadDocumentForm() {
  const { t } = useI18n();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("OTHER");
  const [title, setTitle] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("title", title || file.name);
    body.set("receivedAt", receivedAt);
    body.set("notes", notes);

    const res = await fetch("/api/documents", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "failed");
      return;
    }
    setOpen(false);
    setTitle("");
    setNotes("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> {t("documents.upload")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("documents.upload")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("documents.file")}</Label>
            <Input
              ref={fileRef}
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx"
            />
            <p className="text-xs text-muted-foreground">{t("documents.fileHint")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("documents.kind")}</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`status.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("documents.receivedAt")}</Label>
              <Input
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("documents.documentTitle")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("documents.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
          {error && (
            <p className="text-xs text-destructive">
              {t(`documents.error.${error}`)}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? t("common.saving") : t("documents.upload")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
