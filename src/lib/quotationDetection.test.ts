// Quotation detection — default regex must match filename convention 14/07/2569.
import { describe, it, expect } from "vitest";
import { DEFAULT_QUOTATION_CONFIG } from "@/lib/quotationDetection";

function matchAny(filename: string): { name: string; groups: RegExpMatchArray } | null {
  for (const p of DEFAULT_QUOTATION_CONFIG.patterns) {
    if (!p.enabled) continue;
    const re = new RegExp(p.regex, "i");
    const m = filename.match(re);
    if (m) return { name: p.name, groups: m };
  }
  return null;
}

describe("Quotation filename regex (default config)", () => {
  it("detects BNP-V code without date prefix (Test 9)", () => {
    const r = matchAny("ยังไม่ระบุวันคุณลี่-BNP-V256907-0063.pdf");
    expect(r?.name).toBe("BNP Quote");
    expect(r?.groups?.[1]).toBe("2569");
  });
  it("detects BNP-N code mid-filename with date prefix (Test 10)", () => {
    const r = matchAny("04062569-งานอาหารบุฟเฟ่ต์-คุณ เดือน-BNP-N256906-0001.pdf");
    expect(r?.name).toBe("BNP Quote");
    expect(r?.groups?.[1]).toBe("2569");
  });
  it("detects merit-event BNP filename (Test 11 regression)", () => {
    const r = matchAny("19072569-งานบุญคุณนิด-BNP-V256907-0137.pdf");
    expect(r?.name).toBe("BNP Quote");
  });
  it("detects merit-event BNP filename with H-N code (Test D regression)", () => {
    const r = matchAny("02082569-งานอาหารคุณบุ๋ม-H-N256907-0044.pdf");
    // H-N Food Quote comes before/after BNP; either match name is accepted so long as detected.
    expect(r).not.toBeNull();
  });
  it("does NOT trigger on non-quotation filenames (Test 12)", () => {
    expect(matchAny("เมนูอาหาร-BNP-logo.pdf")).toBeNull();
    expect(matchAny("เอกสารทั่วไป-256907-0063.pdf")).toBeNull();
  });
});

// ── Test F: quote-year validation still rejects wrong-year document codes ──
// (semantic sanity — code path in markQuotationSent uses group 1 as quote BE year)
describe("Quotation quote-year semantic (group 1)", () => {
  it("group 1 = 2569 for current-year quote (Test A/B/C filenames)", () => {
    for (const f of [
      "04062569-งานอาหารบุฟเฟ่ต์-คุณ เดือน-BNP-N256906-0001.pdf",
      "ยังไม่ระบุวันคุณลี่-BNP-V256907-0063.pdf",
      "19072569-งานบุญคุณนิด-BNP-V256907-0137.pdf",
    ]) {
      const r = matchAny(f);
      expect(r?.groups?.[1]).toBe("2569");
    }
  });
  it("group 1 = distant year for out-of-range document code (Test F reject path)", () => {
    // e.g. BNP-N257506 = quote BE year 2575 (diff > 1 from current 2569) → semantic reject
    const r = matchAny("BNP-N257506-0001.pdf");
    expect(r?.groups?.[1]).toBe("2575");
    const currentBE = new Date().getFullYear() + 543;
    expect(Math.abs(parseInt(r!.groups[1], 10) - currentBE)).toBeGreaterThan(1);
  });
});
