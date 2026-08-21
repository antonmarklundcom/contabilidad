import { describe, it, expect } from "vitest";
import { findSequenceGaps, type SequenceSeries } from "@/lib/reconcile";

/**
 * PLAN Phase 5.9 — the sequence-gap check.
 *
 * Only the emitter can produce this list (STRATEGY §"We emit; they observe"),
 * so it had better be right: these are the fixtures for the pure half.
 */

function series(over: Partial<SequenceSeries> = {}): SequenceSeries {
  return {
    establecimiento: "001",
    punto: "001",
    tipoDocumento: 1,
    periodNumbers: [],
    allNumbers: [],
    currentNumber: 0,
    ...over,
  };
}

describe("findSequenceGaps", () => {
  it("reports nothing for an unbroken run", () => {
    expect(
      findSequenceGaps([
        series({ periodNumbers: [1, 2, 3], allNumbers: [1, 2, 3], currentNumber: 3 }),
      ])
    ).toEqual([]);
  });

  it("finds a single missing number inside the period's range", () => {
    const gaps = findSequenceGaps([
      series({ periodNumbers: [1, 2, 4], allNumbers: [1, 2, 4], currentNumber: 4 }),
    ]);
    expect(gaps).toEqual([
      {
        establecimiento: "001",
        punto: "001",
        tipoDocumento: 1,
        from: 3,
        to: 3,
        count: 1,
        trailing: false,
      },
    ]);
  });

  it("collapses consecutive missing numbers into one run", () => {
    const gaps = findSequenceGaps([
      series({ periodNumbers: [10, 15], allNumbers: [10, 15], currentNumber: 15 }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ from: 11, to: 14, count: 4, trailing: false });
  });

  it("reports separate runs separately", () => {
    const gaps = findSequenceGaps([
      series({ periodNumbers: [1, 3, 6], allNumbers: [1, 3, 6], currentNumber: 6 }),
    ]);
    expect(gaps.map((g) => [g.from, g.to])).toEqual([
      [2, 2],
      [4, 5],
    ]);
  });

  it("does not accuse a company that started mid-sequence", () => {
    // Imported history: the first document this company ever emitted is 500.
    expect(
      findSequenceGaps([
        series({ periodNumbers: [500, 501], allNumbers: [500, 501], currentNumber: 501 }),
      ])
    ).toEqual([]);
  });

  it("does not flag a number a back-dated document in another period owns", () => {
    // 7 exists, it is just dated in a different month.
    expect(
      findSequenceGaps([
        series({ periodNumbers: [6, 8], allNumbers: [6, 7, 8], currentNumber: 8 }),
      ])
    ).toEqual([]);
  });

  it("flags numbers the sequence reserved and no document ever claimed", () => {
    const gaps = findSequenceGaps([
      series({ periodNumbers: [1, 2], allNumbers: [1, 2], currentNumber: 4 }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ from: 3, to: 4, count: 2, trailing: true });
  });

  it("reports the reserved run only on the period holding the newest document", () => {
    // An older period: the newest document (9) lives in a later month, so the
    // reserved run is that month's finding, not this one's.
    expect(
      findSequenceGaps([
        series({ periodNumbers: [1, 2], allNumbers: [1, 2, 9], currentNumber: 11 }),
      ])
    ).toEqual([]);
  });

  it("skips a series with no documents in the period", () => {
    expect(
      findSequenceGaps([series({ periodNumbers: [], allNumbers: [1, 5], currentNumber: 9 })])
    ).toEqual([]);
  });

  it("keeps series apart", () => {
    const gaps = findSequenceGaps([
      series({ periodNumbers: [1, 3], allNumbers: [1, 3], currentNumber: 3 }),
      series({
        punto: "002",
        periodNumbers: [1, 2],
        allNumbers: [1, 2],
        currentNumber: 2,
      }),
      series({
        tipoDocumento: 5,
        periodNumbers: [4, 7],
        allNumbers: [4, 7],
        currentNumber: 7,
      }),
    ]);
    expect(gaps.map((g) => `${g.punto}/${g.tipoDocumento}:${g.from}-${g.to}`)).toEqual([
      "001/1:2-2",
      "001/5:5-6",
    ]);
  });
});
