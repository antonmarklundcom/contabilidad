"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Loader2, CheckCircle2 } from "lucide-react";

interface ImportResult {
  created: number;
  skipped: number;
  errors: number;
}

export function ImportClient() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/expenses/import", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok) {
        setResult(json);
        router.refresh();
      } else {
        setError(json.error ?? "error");
      }
    } catch {
      setError("network");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <Alert variant="info">
        <FileSpreadsheet />
        <AlertDescription>{t("expenses.importHint")}</AlertDescription>
      </Alert>

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
              if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center transition-colors",
              dragOver ? "border-primary bg-accent" : "border-input"
            )}
          >
            {uploading ? (
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-muted-foreground" />
            ) : (
              <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">{t("expenses.importFile")}</p>
            <Button type="button" variant="outline" className="mt-4" disabled={uploading}>
              {t("expenses.importSubmit")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
        </CardContent>
      </Card>

      {result && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>
            {t("expenses.importResult", {
              created: result.created,
              skipped: result.skipped,
              errors: result.errors,
            })}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t("common.error")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
