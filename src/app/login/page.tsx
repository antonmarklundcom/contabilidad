import { getT } from "@/lib/i18n-server";
import { LoginForm } from "./login-form";
import { LanguageSwitch } from "@/components/language-switch";
import { FileText } from "lucide-react";

export default async function LoginPage() {
  const { t } = await getT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitch />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t("app.name")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
