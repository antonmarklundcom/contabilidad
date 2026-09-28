"use client";

import { useState } from "react";
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
import { UserPlus } from "lucide-react";
import { switchCompany } from "../actions";
import { addMember } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/company-admin";

export function SwitchButton({ companyId, active }: { companyId: string; active: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (active) {
    return <span className="self-center text-xs text-muted-foreground">{t("companies.active")}</span>;
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await switchCompany(companyId);
        setBusy(false);
        if (res.ok) router.push("/");
        router.refresh();
      }}
    >
      {t("companies.open")}
    </Button>
  );
}

/**
 * Admin only (the server checks `users:manage` again). A known email just
 * gains access; an unknown one gets a login with the password typed here,
 * which the admin hands over and the user changes in Settings.
 */
export function AddMemberForm({ companyId }: { companyId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [v, setV] = useState({ email: "", name: "", role: "client", password: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await addMember({ companyId, ...v });
    setBusy(false);
    if (res.ok) {
      setMessage(res.created ? t("companies.memberCreated") : t("companies.memberAdded"));
      setV({ email: "", name: "", role: "client", password: "" });
      router.refresh();
    } else {
      const key = `companies.errors.${res.error}`;
      setMessage(t(key) !== key ? t(key) : t("common.error"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <UserPlus /> {t("companies.addMember")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("companies.addMember")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("companies.addMemberHint")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="m-email">{t("companies.email")}</Label>
            <Input
              id="m-email"
              type="email"
              required
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{t("companies.name")}</Label>
            <Input id="m-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-role">{t("companies.role")}</Label>
            <select
              id="m-role"
              className="w-full rounded-md border bg-card px-2 py-2 text-sm"
              value={v.role}
              onChange={(e) => setV({ ...v, role: e.target.value })}
            >
              <option value="client">{t("companies.roles.client")}</option>
              <option value="accountant">{t("companies.roles.accountant")}</option>
              <option value="admin">{t("companies.roles.admin")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-pass">{t("companies.initialPassword")}</Label>
            <Input
              id="m-pass"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={v.password}
              onChange={(e) => setV({ ...v, password: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {t("companies.addMember")}
            </Button>
            {message && <span className="text-sm">{message}</span>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
