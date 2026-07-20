import { describe, it, expect } from "vitest";
import {
  rucLastDigit,
  dueDayForRuc,
  nextBusinessDay,
  f120DueDate,
  previousPeriod,
  daysUntil,
} from "@/lib/tax-calendar";
import { nextPeriod } from "@/lib/form120";

describe("rucLastDigit / dueDayForRuc", () => {
  it("uses the last digit of the RUC base", () => {
    expect(rucLastDigit("80012345")).toBe("5");
    expect(dueDayForRuc("80012345")).toBe(17);
  });
  it("covers the full perpetual-calendar table", () => {
    const expected: Record<string, number> = {
      "0": 7, "1": 9, "2": 11, "3": 13, "4": 15,
      "5": 17, "6": 19, "7": 21, "8": 23, "9": 25,
    };
    for (const [digit, day] of Object.entries(expected)) {
      expect(dueDayForRuc(`8001234${digit}`)).toBe(day);
    }
  });
  it("ignores non-digits", () => {
    expect(rucLastDigit("80.012.345")).toBe("5");
  });
  it("throws on a RUC without digits", () => {
    expect(() => rucLastDigit("abc")).toThrow();
  });
});

describe("nextBusinessDay", () => {
  it("keeps weekdays", () => {
    // 2026-07-15 is a Wednesday
    const d = new Date(Date.UTC(2026, 6, 15));
    expect(nextBusinessDay(d).toISOString().slice(0, 10)).toBe("2026-07-15");
  });
  it("rolls Saturday and Sunday to Monday", () => {
    // 2026-07-18 is a Saturday, 19 a Sunday
    expect(nextBusinessDay(new Date(Date.UTC(2026, 6, 18))).toISOString().slice(0, 10)).toBe("2026-07-20");
    expect(nextBusinessDay(new Date(Date.UTC(2026, 6, 19))).toISOString().slice(0, 10)).toBe("2026-07-20");
  });
});

describe("f120DueDate", () => {
  it("falls due in the month AFTER the period", () => {
    // Period June 2026, RUC ending 5 → day 17 of July 2026 (Friday)
    const due = f120DueDate("80012345", 2026, 6);
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-17");
  });
  it("weekend-shifts the due day", () => {
    // Period June 2026, RUC ending 6 → day 19 of July 2026 is a Sunday → Monday 20
    const due = f120DueDate("80012346", 2026, 6);
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-20");
  });
  it("handles the December → January rollover", () => {
    // Period December 2025, RUC ending 0 → day 7 of January 2026 (Wednesday)
    const due = f120DueDate("80012340", 2025, 12);
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-07");
  });
});

describe("previousPeriod / nextPeriod", () => {
  it("are inverses across the year boundary", () => {
    expect(previousPeriod(new Date(Date.UTC(2026, 0, 5)))).toEqual({ year: 2025, month: 12 });
    expect(nextPeriod(2025, 12)).toEqual({ year: 2026, month: 1 });
    expect(previousPeriod(new Date(Date.UTC(2026, 6, 20)))).toEqual({ year: 2026, month: 6 });
    expect(nextPeriod(2026, 6)).toEqual({ year: 2026, month: 7 });
  });
});

describe("daysUntil", () => {
  it("counts whole days, sign included", () => {
    const today = new Date(Date.UTC(2026, 6, 15));
    expect(daysUntil(today, new Date(Date.UTC(2026, 6, 17)))).toBe(2);
    expect(daysUntil(today, new Date(Date.UTC(2026, 6, 15)))).toBe(0);
    expect(daysUntil(today, new Date(Date.UTC(2026, 6, 13)))).toBe(-2);
  });
});
