"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, ShieldCheck, XCircle } from "lucide-react";
import type { CheckFinding, Verdict } from "@/lib/comprobante-check";

/**
 * Paste-a-CDC verification (PLAN Phase 5.8).
 *
 * Shows the findings list, not just the verdict — the same stance as the
 * reconciliation panel: we show our work and the human decides. SIFEN's own
 * message is rendered verbatim inside the finding; our dictionary explains
 * around it, it never replaces it.
 */

const VERDICT_STYLE: Record<Verdict, { variant: "success" | "warning" | "destructive" | "info"; Icon: typeof CheckCircle2 }> = {
  verified: { variant: "success", Icon: CheckCircle2 },
  rejected: { variant: "destructive", Icon: XCircle },
  mismatch: { variant: "warning", Icon: AlertTriangle },
  unknown: { variant: "info", Icon: HelpCircle },
};

interface VerifyResponse {
  cdc: string;
  verdict: Verdict;
  findings: CheckFinding[];
}

export function CdcCheckPanel({
  expenseId,
  initialCdc,
  initialVerdict,
  verifiedAt,
  verifiedBy,
}: {
  expenseId: string;
  initialCdc: string | null;
  initialVerdict: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}) {
  const { t, dateTime } = useI18n();
  const router = useRouter();
  const [cdc, setCdc] = useState(initialCdc ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/comprobantes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cdc, expenseId }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setResult(await res.json());
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // The live result wins; otherwise fall back to whatever was stored, so the
  // panel says what is known rather than going blank on reload.
  const verdict = (result?.verdict ?? initialVerdict) as Verdict | null;
  const style = verdict ? VERDICT_STYLE[verdict] : null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          {t("expenses.cdcCheck.title")}
          {verdict && (
            <Badge variant={style!.variant}>
              {t(`expenses.cdcCheck.verdictShort.${verdict}`)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("expenses.cdcCheck.hint")}</p>

        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[22rem] flex-1">
            <Label htmlFor="cdc">{t("expenses.cdcCheck.cdc")}</Label>
            <Input
              id="cdc"
              value={cdc}
              inputMode="numeric"
              placeholder="01800695631001001000012312026051411234567890"
              onChange={(e) => setCdc(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button type="submit" disabled={busy || !cdc.trim()}>
            {busy ? t("expenses.cdcCheck.verifying") : t("expenses.cdcCheck.verify")}
          </Button>
        </form>

        {failed && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>{t("expenses.cdcCheck.failed")}</AlertDescription>
          </Alert>
        )}

        {verdict && style && (
          <Alert variant={style.variant}>
            <style.Icon />
            <AlertDescription>{t(`expenses.cdcCheck.verdict.${verdict}`)}</AlertDescription>
          </Alert>
        )}

        {result && result.findings.length > 0 && (
          <ul className="space-y-1 text-sm">
            {result.findings.map((finding, i) => (
              <li key={`${finding.code}-${i}`} className="flex items-start gap-2">
                {finding.severity === "error" ? (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : finding.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span>{t(`expenses.cdcCheck.finding.${finding.code}`, finding.values ?? {})}</span>
              </li>
            ))}
          </ul>
        )}

        {!result && verifiedAt && (
          <p className="text-xs text-muted-foreground">
            {t("expenses.cdcCheck.verifiedAt", {
              date: dateTime(new Date(verifiedAt)),
              user: verifiedBy ?? "—",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
