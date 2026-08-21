"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Receipt,
  BookOpen,
  Landmark,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/invoices", key: "nav.invoices", icon: FileText },
  { href: "/clients", key: "nav.clients", icon: Users },
  { href: "/products", key: "nav.products", icon: Package },
  { href: "/expenses", key: "nav.expenses", icon: Receipt },
  { href: "/books", key: "nav.books", icon: BookOpen },
  { href: "/taxes", key: "nav.taxes", icon: Landmark },
  { href: "/documents", key: "nav.documents", icon: FolderOpen },
  { href: "/reports", key: "nav.reports", icon: BarChart3 },
  { href: "/settings", key: "nav.settings", icon: Settings },
] as const;

const ENV_STYLES: Record<string, string> = {
  mock: "bg-amber-500 text-white",
  test: "bg-orange-500 text-white",
  production: "bg-emerald-600 text-white",
};

export function AppShell({
  companyName,
  sifenMode,
  userName,
  userEmail,
  children,
}: {
  companyName: string;
  sifenMode: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-white"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <FileText className="h-5 w-5" />
          <span className="font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        {nav}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <span className="flex items-center gap-2 font-semibold">
                <FileText className="h-5 w-5" /> {t("app.name")}
              </span>
              <button onClick={() => setMobileOpen(false)} aria-label={t("common.close")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4">
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{companyName}</p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold tracking-wide",
              ENV_STYLES[sifenMode] ?? ENV_STYLES.mock
            )}
            title={t(`env.${sifenMode}Hint`)}
          >
            {t(`env.${sifenMode}`)}
          </span>
          <LanguageSwitch />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm">{userName}</p>
                <p className="text-xs font-normal text-muted-foreground">{userEmail}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
