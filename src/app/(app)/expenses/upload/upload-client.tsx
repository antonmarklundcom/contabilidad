"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { UploadCloud, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

interface UploadItem {
  name: string;
  status: "processing" | "done" | "error";
  expenseId?: string;
  error?: string;
}

export function UploadClient({ ocrConfigured }: { ocrConfigured: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      setItems((prev) => [...prev, { name: file.name, status: "processing" }]);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/expenses/upload", { method: "POST", body: form });
        const json = await res.json();
        setItems((prev) =>
          prev.map((it) =>
            it.name === file.name && it.status === "processing"
              ? res.ok
                ? { ...it, status: "done", expenseId: json.id }
                : { ...it, status: "error", error: json.error }
              : it
          )
        );
      } catch {
        setItems((prev) =>
          prev.map((it) =>
            it.name === file.name && it.status === "processing"
              ? { ...it, status: "error", error: "network" }
              : it
          )
        );
      }
    }
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-4">
      {!ocrConfigured && (
        <Alert variant="info">
          <Info />
          <AlertDescription>{t("expenses.noApiKey")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center transition-colors",
              dragOver ? "border-primary bg-accent" : "border-input"
            )}
          >
            <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("expenses.uploadHint")}</p>
            <Button type="button" variant="outline" className="mt-4">
              {t("expenses.takePhoto")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                {it.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {it.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {it.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                <span className="truncate">{it.name}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {it.status === "processing"
                    ? t("expenses.processing")
                    : it.status === "done"
                      ? t("expenses.processed")
                      : t("expenses.processFailed")}
                </span>
                {it.status === "done" && it.expenseId && (
                  <Button size="sm" variant="outline" onClick={() => router.push(`/expenses/${it.expenseId}`)}>
                    {t("expenses.review")}
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
