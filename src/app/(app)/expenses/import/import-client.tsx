"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, FileCode2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ImportResult {
  created: number;
  skipped: number;
  errors: number;
}

/** The XML import reports more outcomes, because it can MERGE (PLAN 3.3). */
interface XmlImportResult extends ImportResult {
  merged: number;
  conflicts: number;
  foreign: number;
  errorFiles?: { file: string; error: string }[];
}

export function ImportClient() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [xmlDragOver, setXmlDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [xmlResult, setXmlResult] = useState<XmlImportResult | null>(null);
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

  /** Batch by design — nobody downloads one XML. */
  async function uploadXml(files: FileList | File[]) {
    setUploading(true);
    setError(null);
    setXmlResult(null);
    const form = new FormData();
    for (const file of Array.from(files)) form.append("file", file);
    try {
      const res = await fetch("/api/expenses/import-xml", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok) {
        setXmlResult(json);
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
    <Tabs defaultValue="xml" className="space-y-4">
      <TabsList>
        <TabsTrigger value="xml">
          <FileCode2 className="mr-1 size-4" /> {t("expenses.import_tab.xml")}
        </TabsTrigger>
        <TabsTrigger value="spreadsheet">
          <FileSpreadsheet className="mr-1 size-4" /> {t("expenses.import_tab.spreadsheet")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="xml" className="space-y-4">
        <Alert variant="info">
          <FileCode2 />
          <AlertDescription>{t("expenses.xmlHint")}</AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setXmlDragOver(true);
              }}
              onDragLeave={() => setXmlDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setXmlDragOver(false);
                if (e.dataTransfer.files.length) uploadXml(e.dataTransfer.files);
              }}
              onClick={() => xmlInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center transition-colors",
                xmlDragOver ? "border-primary bg-accent" : "border-input"
              )}
            >
              {uploading ? (
                <Loader2 className="mb-3 h-10 w-10 animate-spin text-muted-foreground" />
              ) : (
                <FileCode2 className="mb-3 h-10 w-10 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">{t("expenses.xmlFile")}</p>
              <Button type="button" variant="outline" className="mt-4" disabled={uploading}>
                {t("expenses.xmlSubmit")}
              </Button>
              <input
                ref={xmlInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && uploadXml(e.target.files)}
              />
            </div>
          </CardContent>
        </Card>

        {xmlResult && (
          <>
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>
                {t("expenses.xmlResult", {
                  created: xmlResult.created,
                  merged: xmlResult.merged,
                  skipped: xmlResult.skipped,
                  conflicts: xmlResult.conflicts,
                  foreign: xmlResult.foreign,
                  errors: xmlResult.errors,
                })}
              </AlertDescription>
            </Alert>
            {xmlResult.conflicts > 0 && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{t("expenses.conflictsHint")}</AlertDescription>
              </Alert>
            )}
            {xmlResult.errorFiles && xmlResult.errorFiles.length > 0 && (
              <div className="space-y-1 rounded-md border p-3 text-sm">
                <h3 className="font-medium">{t("expenses.xmlErrorTitle")}</h3>
                <ul className="space-y-1 text-muted-foreground">
                  {xmlResult.errorFiles.map((f) => (
                    <li key={f.file}>
                      <span className="font-mono text-xs">{f.file}</span> —{" "}
                      {t(`expenses.xmlError.${f.error}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t("common.error")}</AlertDescription>
          </Alert>
        )}
      </TabsContent>

      <TabsContent value="spreadsheet" className="space-y-4">
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
      </TabsContent>
    </Tabs>
  );
}
