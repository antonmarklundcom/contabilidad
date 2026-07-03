"use client";

import { useUrlParam } from "@/components/list-controls";
import { useI18n } from "@/components/i18n-provider";
import { monthName } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const { locale } = useI18n();
  const setParams = useUrlParam();
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setParams({ month: v })}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <SelectItem key={m} value={String(m)}>
              <span className="capitalize">{monthName(m, locale)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setParams({ year: v })}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
