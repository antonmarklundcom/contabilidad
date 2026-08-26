"use client";

import { useUrlParam } from "@/components/list-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Fiscal-year picker. Starts at last year, because that is the year whose IRP
 * return is actually due — the current year is not filable yet.
 */
export function YearPicker({ year }: { year: number }) {
  const setParams = useUrlParam();
  const latest = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => latest - i);

  return (
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
  );
}
