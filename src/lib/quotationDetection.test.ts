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
  it("does NOT trigger on non-quotation filenames (Test 12)", () => {
    expect(matchAny("เมนูอาหาร-BNP-logo.pdf")).toBeNull();
    expect(matchAny("เอกสารทั่วไป-256907-0063.pdf")).toBeNull();
  });
});
