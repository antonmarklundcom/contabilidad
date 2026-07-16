"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addExpeditionPoint,
  setSequenceNumber,
  testSmtpAction,
  changePassword,
  createUser,
  deleteUser,
} from "./actions";
import { Loader2, CheckCircle2, Upload, Info, Trash2, Plus } from "lucide-react";

const DOC_LABELS: Record<number, string> = { 1: "Factura", 5: "Nota de crédito", 6: "Nota de débito" };

export interface SequenceRow {
  id: string;
  establecimiento: string;
  punto: string;
  tipoDocumento: number;
  currentNumber: number;
}

// ── Sequences ────────────────────────────────────────────────────────────────

export function SequencesPanel({ sequences }: { sequences: SequenceRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [est, setEst] = useState("001");
  const [punto, setPunto] = useState("001");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});

  async function addPoint() {
    setBusy(true);
    await addExpeditionPoint(est, punto);
    setBusy(false);
    router.refresh();
  }

  async function saveSeq(id: string) {
    if (edits[id] === undefined) return;
    await setSequenceNumber(id, edits[id]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.sequences")}</CardTitle>
        <CardDescription>{t("settings.establishmentsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>{t("settings.establishment")}</Label>
            <Input value={est} onChange={(e) => setEst(e.target.value)} className="w-24" maxLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.expeditionPoint")}</Label>
            <Input value={punto} onChange={(e) => setPunto(e.target.value)} className="w-24" maxLength={3} />
          </div>
          <Button variant="outline" onClick={addPoint} disabled={busy}>
            {t("common.create")}
          </Button>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.establishment")}</TableHead>
                <TableHead>{t("settings.expeditionPoint")}</TableHead>
                <TableHead>{t("settings.docTypeLabel")}</TableHead>
                <TableHead>{t("settings.nextNumber")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sequences.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.establecimiento}</TableCell>
                  <TableCell className="font-mono">{s.punto}</TableCell>
                  <TableCell>{DOC_LABELS[s.tipoDocumento] ?? s.tipoDocumento}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={s.currentNumber + 1}
                      onChange={(e) => setEdits((p) => ({ ...p, [s.id]: Number(e.target.value) - 1 }))}
                      className="w-32 tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => saveSeq(s.id)}>
                      {t("common.save")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Certificate ──────────────────────────────────────────────────────────────

export function CertificatePanel({
  hasCert,
  expiresAt,
}: {
  hasCert: boolean;
  expiresAt: string | null;
}) {
  const { t, date } = useI18n();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload() {
    if (!file || !password) return;
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    form.append("password", password);
    const res = await fetch("/api/settings/certificate", { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: t("settings.certUploaded") });
      setPassword("");
      setFile(null);
      router.refresh();
    } else {
      setMsg({ ok: false, text: t("common.error") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.certificate")}</CardTitle>
        <CardDescription>{t("settings.certificateHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCert ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>
              {t("settings.certUploaded")}
              {expiresAt && ` — ${t("settings.certExpiry")}: ${date(expiresAt)}`}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="info">
            <Info />
            <AlertDescription>{t("settings.certNone")}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("settings.certUpload")}</Label>
            <Input type="file" accept=".p12,.pfx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.certPassword")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={upload} disabled={busy || !file || !password}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {t("settings.certUpload")}
          </Button>
          {msg && (
            <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
              {msg.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── SIFEN mode (read-only, env-driven) ──────────────────────────────────────

export function SifenModePanel({ mode }: { mode: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.sifenMode")}</CardTitle>
        <CardDescription>{t("settings.sifenModeHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("settings.sifenModeCurrent")}:</span>
          <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold uppercase">
            {t(`env.${mode}`)}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t(`env.${mode}Hint`)}</p>
      </CardContent>
    </Card>
  );
}

// ── SMTP ─────────────────────────────────────────────────────────────────────

export function SmtpPanel({ configured }: { configured: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function test() {
    setBusy(true);
    setMsg(null);
    const res = await testSmtpAction();
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: t("settings.smtpTestOk") } : { ok: false, text: t("settings.smtpTestFail") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.smtp")}</CardTitle>
        <CardDescription>{t("settings.smtpHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured && (
          <Alert variant="info">
            <Info />
            <AlertDescription>{t("settings.smtpNotConfigured")}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={test} disabled={busy || !configured}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t("settings.smtpTest")}
          </Button>
          {msg && (
            <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
              {msg.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Backups ──────────────────────────────────────────────────────────────────

export function BackupPanel({
  backups,
}: {
  backups: { name: string; size: number; createdAt: string }[];
}) {
  const { t, dateTime } = useI18n();
  const [busy, setBusy] = useState(false);

  async function backupNow() {
    setBusy(true);
    const res = await fetch("/api/settings/backup", { method: "POST" });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "backup.zip";
      a.click();
      URL.revokeObjectURL(url);
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.backup")}</CardTitle>
        <CardDescription>{t("settings.backupHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={backupNow} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? t("settings.backupGenerating") : t("settings.backupNow")}
        </Button>

        {backups.length > 0 && (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.backupList")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell className="font-mono text-xs">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">{dateTime(b.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/api/settings/backup?name=${encodeURIComponent(b.name)}`}>
                          {t("common.download")}
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  name: string;
  email: string;
  isYou: boolean;
}

export function UsersPanel({ users }: { users: UserRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const errorText: Record<string, string> = {
    invalid_email: t("common.error"),
    email_in_use: t("settings.userEmailInUse"),
    too_short: t("common.error"),
    name_required: t("common.required"),
    cannot_delete_self: t("settings.cannotDeleteSelf"),
  };

  async function add() {
    setBusy(true);
    setMsg(null);
    const res = await createUser({ name, email, password });
    setBusy(false);
    if (res.ok) {
      setName("");
      setEmail("");
      setPassword("");
      setMsg({ ok: true, text: t("settings.userCreated") });
      router.refresh();
    } else {
      setMsg({ ok: false, text: errorText[res.error] ?? t("common.error") });
    }
  }

  async function remove(id: string) {
    if (!confirm(t("settings.deleteUserConfirm"))) return;
    const res = await deleteUser(id);
    if (!res.ok) {
      setMsg({ ok: false, text: errorText[res.error] ?? t("common.error") });
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.users")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.userName")}</TableHead>
                <TableHead>{t("settings.userEmail")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    {u.name}
                    {u.isYou && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({t("settings.userYou")})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {!u.isYou && (
                      <Button variant="ghost" size="icon" onClick={() => remove(u.id)}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-sm font-medium">{t("settings.newUser")}</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder={t("settings.userName")} value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              type="email"
              placeholder={t("settings.userEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t("settings.newPassword")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={add}
              disabled={busy || !name || !email || password.length < 8}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("settings.addUser")}
            </Button>
            {msg && (
              <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Password ─────────────────────────────────────────────────────────────────

export function PasswordPanel() {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await changePassword(pw);
    setBusy(false);
    if (res.ok) {
      setPw("");
      setMsg({ ok: true, text: t("settings.savedOk") });
    } else {
      setMsg({ ok: false, text: t("common.error") });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.users")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5 max-w-sm">
          <Label>{t("settings.newPassword")}</Label>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={busy || pw.length < 8}>
            {t("settings.changePassword")}
          </Button>
          {msg && (
            <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
              {msg.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
