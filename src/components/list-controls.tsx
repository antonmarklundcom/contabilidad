"use client";

/**
 * Shared list controls: search box, date range, status filter, pagination and
 * CSV export — all URL-driven (searchParams) so lists are shareable and
 * server components can filter.
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/i18n-provider";
import { Download, Search } from "lucide-react";

export function useUrlParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      if (!("page" in updates)) params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );
}

export function SearchBox({ placeholder }: { placeholder?: string }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const setParams = useUrlParam();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((searchParams.get("q") ?? "") !== value) setParams({ q: value });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t("common.search")}
        className="pl-8"
      />
    </div>
  );
}

export function DateRangeFilter() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const setParams = useUrlParam();
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label={t("common.from")}
        value={searchParams.get("from") ?? ""}
        onChange={(e) => setParams({ from: e.target.value || null })}
        className="w-[9.5rem]"
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="date"
        aria-label={t("common.to")}
        value={searchParams.get("to") ?? ""}
        onChange={(e) => setParams({ to: e.target.value || null })}
        className="w-[9.5rem]"
      />
    </div>
  );
}

export function StatusFilter({ options }: { options: string[] }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const setParams = useUrlParam();
  const current = searchParams.get("status") ?? "all";
  return (
    <Select value={current} onValueChange={(v) => setParams({ status: v === "all" ? null : v })}>
      <SelectTrigger className="w-[10.5rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("common.all")}</SelectItem>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {t(`status.${s}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ExportCsvButton({ endpoint }: { endpoint: string }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const href = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${searchParams.toString()}`;
  return (
    <Button variant="outline" size="sm" asChild>
      {/* Plain anchor: the route streams a file download */}
      <a href={href}>
        <Download />
        {t("common.exportCsv")}
      </a>
    </Button>
  );
}

export function Pagination({ page, pages }: { page: number; pages: number }) {
  const { t } = useI18n();
  const setParams = useUrlParam();
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {t("common.page", { page, pages })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setParams({ page: String(page - 1) })}
        >
          {t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setParams({ page: String(page + 1) })}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
