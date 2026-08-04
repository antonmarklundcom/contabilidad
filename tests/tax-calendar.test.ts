import { describe, it, expect } from "vitest";
import {
  PERPETUAL_CALENDAR,
  daysUntil,
  dueDayForRuc,
  easterSunday,
  holidaysForYear,
  irpDueDate,
  ivaDueDate,
  nextIvaFiling,
  nextWorkingDay,
  rucLastDigit,
  toIsoDate,
} from "@/lib/tax/calendar";

/** A RUC body ending in `digit`, hyphenated with an arbitrary DV. */
const rucEndingIn = (digit: number) => `8006956${digit}-1`;

describe("perpetual calendar table", () => {
  it("maps every RUC last digit to its SET due day", () => {
    // Hand-transcribed from the DNIT perpetual calendar, not derived from the
    // module — a formula bug in the source must not be mirrored here.
    const expected: Record<number, number> = {
      0: 7,
      1: 9,
      2: 11,
      3: 13,
      4: 15,
      5: 17,
      6: 19,
      7: 21,
      8: 23,
      9: 25,
    };
    for (let digit = 0; digit <= 9; digit++) {
      expect(PERPETUAL_CALENDAR[digit]).toBe(expected[digit]);
      expect(dueDayForRuc(rucEndingIn(digit))).toBe(expected[digit]);
    }
  });

  it("covers exactly the ten digits", () => {
    expect(PERPETUAL_CALENDAR).toHaveLength(10);
  });

  it("starts on the 7th and ends on the 25th", () => {
    expect(Math.min(...PERPETUAL_CALENDAR)).toBe(7);
    expect(Math.max(...PERPETUAL_CALENDAR)).toBe(25);
  });
});

describe("rucLastDigit", () => {
  it("discards the check digit on a hyphenated RUC", () => {
    expect(rucLastDigit("80069563-1")).toBe(3);
    expect(rucLastDigit("80069560-9")).toBe(0);
  });

  it("uses the trailing digit of a bare RUC body", () => {
    expect(rucLastDigit("80069563")).toBe(3);
    expect(rucLastDigit("4")).toBe(4);
  });

  it("tolerates surrounding whitespace", () => {
    expect(rucLastDigit("  80069563-1  ")).toBe(3);
  });

  it("rejects malformed input rather than guessing", () => {
    expect(rucLastDigit("")).toBeNull();
    expect(rucLastDigit("   ")).toBeNull();
    expect(rucLastDigit("abc")).toBeNull();
    expect(rucLastDigit("80069563-")).toBeNull();
    expect(rucLastDigit("123456789012")).toBeNull();
  });
});

describe("ivaDueDate — one fixture per last digit", () => {
  // Period 2026-04 → filed in May 2026. May 2026: the 1st is a Friday
  // (Día del Trabajador, holiday), so the month's weekdays are ordinary
  // after that. Weekends: 2-3, 9-10, 16-17, 23-24, 30-31.
  const cases: [digit: number, expected: string, why: string][] = [
    [0, "2026-05-07", "7 May 2026 is a Thursday"],
    [1, "2026-05-11", "9 May is a Saturday → Monday the 11th"],
    [2, "2026-05-11", "11 May is a Monday"],
    [3, "2026-05-13", "13 May is a Wednesday"],
    [4, "2026-05-18", "15 May is Independencia (holiday), 16-17 weekend → Monday 18"],
    [5, "2026-05-18", "17 May is a Sunday → Monday the 18th"],
    [6, "2026-05-19", "19 May is a Tuesday"],
    [7, "2026-05-21", "21 May is a Thursday"],
    [8, "2026-05-25", "23 May is a Saturday → Monday the 25th"],
    [9, "2026-05-25", "25 May is a Monday"],
  ];

  for (const [digit, expected, why] of cases) {
    it(`digit ${digit} → ${expected} (${why})`, () => {
      const due = ivaDueDate(rucEndingIn(digit), 2026, 4);
      expect(due).not.toBeNull();
      expect(toIsoDate(due!)).toBe(expected);
    });
  }

  it("returns the raw calendar day when non-working days are not observed", () => {
    // Digit 1 → the 9th; 9 May 2026 is a Saturday.
    const raw = ivaDueDate(rucEndingIn(1), 2026, 4, { observeNonWorkingDays: false });
    expect(toIsoDate(raw!)).toBe("2026-05-09");
  });
});

describe("ivaDueDate — period and year boundaries", () => {
  it("files a period in the FOLLOWING month", () => {
    // January 2026 period → due February 2026.
    const due = ivaDueDate(rucEndingIn(0), 2026, 1);
    expect(toIsoDate(due!)).toBe("2026-02-09"); // 7 Feb 2026 is a Saturday → Mon 9
  });

  it("rolls December's period into January of the next year", () => {
    const due = ivaDueDate(rucEndingIn(3), 2025, 12);
    // Digit 3 → the 13th; 13 January 2026 is a Tuesday.
    expect(toIsoDate(due!)).toBe("2026-01-13");
  });

  it("handles a December period whose due date is itself a weekend", () => {
    // Digit 0 → the 7th; 7 January 2024 is a Sunday → Monday the 8th.
    const due = ivaDueDate(rucEndingIn(0), 2023, 12);
    expect(toIsoDate(due!)).toBe("2024-01-08");
  });

  it("rejects out-of-range months instead of wrapping silently", () => {
    expect(ivaDueDate(rucEndingIn(0), 2026, 0)).toBeNull();
    expect(ivaDueDate(rucEndingIn(0), 2026, 13)).toBeNull();
    expect(ivaDueDate(rucEndingIn(0), 2026, 1.5)).toBeNull();
  });

  it("returns null for an unparseable RUC rather than a wrong date", () => {
    expect(ivaDueDate("", 2026, 4)).toBeNull();
    expect(ivaDueDate("not-a-ruc", 2026, 4)).toBeNull();
  });
});

describe("irpDueDate", () => {
  it("falls due in March of the following year, per digit", () => {
    // March 2026: 1 Mar is Día de los Héroes (Sunday that year anyway).
    // Weekends: 7-8, 14-15, 21-22, 28-29.
    const cases: [digit: number, expected: string][] = [
      [0, "2026-03-09"], // 7 Mar Saturday → Monday 9
      [1, "2026-03-09"], // 9 Mar Monday
      [2, "2026-03-11"],
      [3, "2026-03-13"],
      [4, "2026-03-16"], // 15 Mar Sunday → Monday 16
      [5, "2026-03-17"],
      [6, "2026-03-19"],
      [7, "2026-03-23"], // 21 Mar Saturday → Monday 23
      [8, "2026-03-23"],
      [9, "2026-03-25"],
    ];
    for (const [digit, expected] of cases) {
      const due = irpDueDate(rucEndingIn(digit), 2025);
      expect(toIsoDate(due!), `digit ${digit}`).toBe(expected);
    }
  });

  it("returns null for an unparseable RUC", () => {
    expect(irpDueDate("???", 2025)).toBeNull();
  });
});

describe("non-working day handling", () => {
  it("rolls a Saturday and a Sunday forward to Monday", () => {
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2026, 4, 9))))).toBe("2026-05-11");
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2026, 4, 10))))).toBe("2026-05-11");
  });

  it("leaves an ordinary weekday alone", () => {
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2026, 4, 13))))).toBe("2026-05-13");
  });

  it("rolls a fixed national holiday forward", () => {
    // 1 May 2026 (Día del Trabajador) is a Friday → Monday the 4th.
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2026, 4, 1))))).toBe("2026-05-04");
  });

  it("crosses a year boundary when the roll runs past 31 December", () => {
    // 25 Dec 2027 (Navidad) is a Saturday; 26-27 weekend follows Sunday...
    // 25 Sat → 26 Sun → 27 Mon is a working day.
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2027, 11, 25))))).toBe("2027-12-27");
    // 31 Dec 2027 is a Friday and not a holiday, but 1 Jan 2028 is a Saturday
    // and a holiday: starting there must land on Monday 3 January 2028.
    expect(toIsoDate(nextWorkingDay(new Date(Date.UTC(2028, 0, 1))))).toBe("2028-01-03");
  });

  it("honours decree-declared asuetos passed in by the caller", () => {
    // 13 May 2026 is an ordinary Wednesday and normally the digit-3 due date.
    // Declaring it non-working pushes past 14-15 May (Independencia Nacional)
    // and the 16-17 weekend, landing on Monday the 18th.
    const due = ivaDueDate(rucEndingIn(3), 2026, 4, { extraHolidays: ["2026-05-13"] });
    expect(toIsoDate(due!)).toBe("2026-05-18");

    // A caller-declared asueto on an otherwise clear day moves exactly one day.
    const oneDay = ivaDueDate(rucEndingIn(6), 2026, 4, { extraHolidays: ["2026-05-19"] });
    expect(toIsoDate(oneDay!)).toBe("2026-05-20"); // 20 May 2026 is a Wednesday
  });
});

describe("holiday derivation", () => {
  it("computes Easter Sunday correctly for known years", () => {
    expect(toIsoDate(easterSunday(2024))).toBe("2024-03-31");
    expect(toIsoDate(easterSunday(2025))).toBe("2025-04-20");
    expect(toIsoDate(easterSunday(2026))).toBe("2026-04-05");
    expect(toIsoDate(easterSunday(2027))).toBe("2027-03-28");
  });

  it("includes Jueves Santo and Viernes Santo", () => {
    const h = holidaysForYear(2026);
    expect(h).toContain("2026-04-02"); // Jueves Santo
    expect(h).toContain("2026-04-03"); // Viernes Santo
  });

  it("includes the fixed national holidays", () => {
    const h = holidaysForYear(2026);
    for (const day of [
      "2026-01-01",
      "2026-03-01",
      "2026-05-01",
      "2026-05-14",
      "2026-05-15",
      "2026-06-12",
      "2026-08-15",
      "2026-09-29",
      "2026-12-08",
      "2026-12-25",
    ]) {
      expect(h).toContain(day);
    }
  });
});

describe("daysUntil", () => {
  it("counts whole calendar days regardless of time of day", () => {
    const from = new Date("2026-05-01T23:30:00Z");
    expect(daysUntil(new Date("2026-05-11T00:00:00Z"), from)).toBe(10);
  });

  it("is 0 on the due date itself", () => {
    const from = new Date("2026-05-11T08:00:00Z");
    expect(daysUntil(new Date("2026-05-11T00:00:00Z"), from)).toBe(0);
  });

  it("goes negative once the date has passed", () => {
    const from = new Date("2026-05-13T00:00:00Z");
    expect(daysUntil(new Date("2026-05-11T00:00:00Z"), from)).toBe(-2);
  });

  it("is unaffected by a due date crossing a DST-style boundary", () => {
    // Paraguay observes DST; the module works in UTC so the count stays exact.
    expect(daysUntil(new Date("2026-10-20T00:00:00Z"), new Date("2026-10-01T00:00:00Z"))).toBe(19);
  });
});

describe("nextIvaFiling", () => {
  it("points at last month's period while its due date is still ahead", () => {
    // On 1 May 2026, the April period (due 13 May for digit 3) is next.
    const next = nextIvaFiling(rucEndingIn(3), new Date("2026-05-01T00:00:00Z"));
    expect(next).toMatchObject({ type: "IVA", year: 2026, month: 4, daysRemaining: 12 });
    expect(toIsoDate(next!.dueDate)).toBe("2026-05-13");
  });

  it("is still last month's period on the due date itself", () => {
    const next = nextIvaFiling(rucEndingIn(3), new Date("2026-05-13T09:00:00Z"));
    expect(next).toMatchObject({ month: 4, daysRemaining: 0 });
  });

  it("advances to the current month's period once the due date passes", () => {
    const next = nextIvaFiling(rucEndingIn(3), new Date("2026-05-14T00:00:00Z"));
    expect(next).toMatchObject({ year: 2026, month: 5 });
    expect(toIsoDate(next!.dueDate)).toBe("2026-06-15"); // 13 Jun 2026 is a Saturday
  });

  it("handles January, where the pending period is last December", () => {
    const next = nextIvaFiling(rucEndingIn(3), new Date("2026-01-05T00:00:00Z"));
    expect(next).toMatchObject({ year: 2025, month: 12 });
    expect(toIsoDate(next!.dueDate)).toBe("2026-01-13");
  });

  it("returns null for an unparseable RUC", () => {
    expect(nextIvaFiling("nope")).toBeNull();
  });
});
