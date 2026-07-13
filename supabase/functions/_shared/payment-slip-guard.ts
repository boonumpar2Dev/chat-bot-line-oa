// Patch 2.9.1 (Payment Extension) — PaymentSlipGuard
//
// Pure deterministic evaluator: given OCR text of an image message and the
// customer's lifecycle, decide whether it's a payment slip and produce a
// safe deterministic acknowledgement. All side effects (LINE reply, DB
// update, cohort gating) belong to the caller.
//
// Scope constraints:
//   • Only OCR text from images is inspected — no separate OCR service.
//   • Does NOT confirm payment success, does NOT echo bank/account/ref
//     numbers, does NOT ask any follow-up question.
//   • Categorises by lifecycle only (deposit for pending_confirm, balance
//     for post-confirm lifecycles). If unsure, returns unclassified.
//   • Amount is optional — inserted into reply only when confidently parsed.

export type PaymentSlipCategory =
  | "deposit_slip_received"
  | "balance_slip_received"
  | "payment_slip_received_unclassified";

export interface PaymentSlipGuardConfig {
  enabled?: boolean;
  /** Lifecycles treated as deposit context. Default: ["pending_confirm"] */
  deposit_lifecycles?: string[];
  /** Lifecycles treated as balance/post-confirm context. */
  balance_lifecycles?: string[];
  /** Min signals from different families required to treat as a slip. Default 2. */
  min_signals?: number;
}

export interface PaymentSlipGuardInput {
  lifecycle: string | null | undefined;
  ocrText: string | null | undefined;
  config?: PaymentSlipGuardConfig | null;
}

export interface PaymentSlipGuardResult {
  matched: boolean;
  category: PaymentSlipCategory | null;
  amount: number | null;
  replyText: string;
  reason: string;
  signals: string[];
}

const DEFAULT_DEPOSIT_LIFECYCLES = ["pending_confirm"];
const DEFAULT_BALANCE_LIFECYCLES = [
  "confirmed",
  "confirmed_returning",
  "completed",
  "returning",
];

// Signal families — each family contributes at most 1 to the confidence count.
const SIGNAL_FAMILIES: Array<{ tag: string; re: RegExp }> = [
  { tag: "transfer-verb", re: /(?:โอนเงิน|โอนแล้ว|โอนสำเร็จ|โอนเรียบร้อย|transfer\s*success|transferred)/i },
  { tag: "status-success", re: /(?:สำเร็จ|เรียบร้อย|ทำรายการสำเร็จ|success(?:ful)?)/i },
  { tag: "amount-word", re: /(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|amount)/i },
  { tag: "baht-tail", re: /[\d.,]+\s*บาท/ },
  { tag: "bank-name", re: /(?:SCB|KBANK|BBL|KTB|BAY|TMB|TTB|UOB|CIMB|GSB|ธนาคาร|ไทยพาณิชย์|กสิกร|กรุงเทพ|กรุงไทย|กรุงศรี|ทหารไทย|ออมสิน|พร้อมเพย์|PromptPay|K\s*PLUS|SCB\s*EASY)/i },
  { tag: "ref-line", re: /(?:เลขที่รายการ|รหัสอ้างอิง|Ref(?:erence)?[.:]?\s*(?:No)?|Trans(?:action)?\s*(?:No|ID)|Trace\s*ID)/i },
  { tag: "datetime", re: /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}[^0-9]{1,10}\d{1,2}:\d{2}/ },
];

// Amount extraction: prefer explicit label; then baht suffix. Skip lines
// that are clearly fees.
function extractAmount(text: string): number | null {
  const lines = text.split(/\r?\n/);

  const parseNumberStr = (raw: string): number | null => {
    const cleaned = raw.replace(/,/g, "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Reject values that look like account/ref numbers (too large / no decimal
    // and >= 8 digits without baht word context is handled upstream).
    return n;
  };

  const isFeeLine = (line: string) => /(?:ค่าธรรมเนียม|fee)/i.test(line);
  const isAccountLine = (line: string) =>
    /(?:เลขที่บัญชี|บัญชี|account\s*(?:no|number)|เลขที่รายการ|รหัสอ้างอิง|ref(?:erence)?[.:]?)/i.test(line);

  // Pass 1: label "จำนวนเงิน / ยอดเงิน / ยอดโอน / amount" + number.
  for (const line of lines) {
    if (isFeeLine(line) || isAccountLine(line)) continue;
    const m = line.match(/(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|amount)[^\d]{0,8}([\d,]+(?:\.\d{1,2})?)/i);
    if (m) {
      const n = parseNumberStr(m[1]);
      if (n !== null) return n;
    }
  }
  // Pass 2: "N บาท" but line must not be fee/account.
  for (const line of lines) {
    if (isFeeLine(line) || isAccountLine(line)) continue;
    const m = line.match(/([\d,]+(?:\.\d{1,2})?)\s*บาท/);
    if (m) {
      const n = parseNumberStr(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

function formatAmount(n: number): string {
  const isInt = Math.abs(n - Math.round(n)) < 0.005;
  const s = isInt
    ? Math.round(n).toLocaleString("en-US")
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s;
}

function buildReply(category: PaymentSlipCategory, amount: number | null): string {
  if (category === "deposit_slip_received") {
    return amount !== null
      ? `รับสลิปยอด ${formatAmount(amount)} บาทไว้แล้วค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบยอดและประสานรายละเอียดต่อนะคะ 🙏`
      : `รับสลิปไว้แล้วค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบยอดและประสานรายละเอียดต่อนะคะ 🙏`;
  }
  if (category === "balance_slip_received") {
    return amount !== null
      ? `รับสลิปยอด ${formatAmount(amount)} บาทไว้แล้วค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบและประสานงานต่อนะคะ 🙏`
      : `รับสลิปไว้แล้วค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบและประสานงานต่อนะคะ 🙏`;
  }
  // unclassified
  return `รับสลิปไว้แล้วค่ะ เดี๋ยวเจ้าหน้าที่ตรวจสอบและประสานงานต่อนะคะ 🙏`;
}

export function evaluatePaymentSlipGuard(
  input: PaymentSlipGuardInput,
): PaymentSlipGuardResult {
  const cfg = input.config ?? null;
  const enabled = cfg?.enabled !== false;
  const minSignals = typeof cfg?.min_signals === "number" && cfg.min_signals! > 0
    ? cfg.min_signals!
    : 2;
  const depositLc = Array.isArray(cfg?.deposit_lifecycles) && cfg!.deposit_lifecycles!.length
    ? cfg!.deposit_lifecycles!
    : DEFAULT_DEPOSIT_LIFECYCLES;
  const balanceLc = Array.isArray(cfg?.balance_lifecycles) && cfg!.balance_lifecycles!.length
    ? cfg!.balance_lifecycles!
    : DEFAULT_BALANCE_LIFECYCLES;

  const empty: PaymentSlipGuardResult = {
    matched: false, category: null, amount: null, replyText: "", reason: "", signals: [],
  };

  if (!enabled) return { ...empty, reason: "disabled" };

  const text = (input.ocrText ?? "").toString();
  if (!text.trim()) return { ...empty, reason: "no-ocr-text" };

  const signals: string[] = [];
  for (const f of SIGNAL_FAMILIES) {
    if (f.re.test(text)) signals.push(f.tag);
  }
  if (signals.length < minSignals) {
    return { ...empty, reason: `weak-signals:${signals.length}<${minSignals}`, signals };
  }

  const lc = (input.lifecycle ?? "").toString().trim();
  let category: PaymentSlipCategory;
  if (depositLc.includes(lc)) category = "deposit_slip_received";
  else if (balanceLc.includes(lc)) category = "balance_slip_received";
  else return { ...empty, reason: `lifecycle-not-supported:${lc || "none"}`, signals };

  const amount = extractAmount(text);
  return {
    matched: true,
    category,
    amount,
    replyText: buildReply(category, amount),
    reason: amount !== null ? "matched:with-amount" : "matched:no-amount",
    signals,
  };
}

export const __PAYMENT_SLIP_GUARD_DEFAULTS = {
  depositLifecycles: DEFAULT_DEPOSIT_LIFECYCLES,
  balanceLifecycles: DEFAULT_BALANCE_LIFECYCLES,
  minSignals: 2,
};
