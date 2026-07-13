// Phase 2A — B1 helpers
// Pure helpers for:
//   1) classifying customer date intent (confirm / change / inquiry / mention)
//   2) gating event_date overwrite from the deterministic anchor
//   3) deciding when to (re)run the handover extractor from webhook triggers
//   4) merging extracted fields with fill_only + explicit-event_date overwrite
//
// These helpers are pure & side-effect free so they can be unit-tested and
// re-used by both extract-event-from-chat and line-webhook without touching
// existing production flow until wired.

import { stripImageOcrBlocks } from "./ai-policy.ts";

// ---------------------------------------------------------------------------
// 1) Intent classifier
// ---------------------------------------------------------------------------

export type DateIntent = "confirm" | "change" | "inquiry" | "mention";

// Order matters: CHANGE > CONFIRM > INQUIRY > MENTION.
// Regexes stay narrow — only phrasings a Thai customer uses to *decide* a date.
// We intentionally do NOT match single-word "จัด" / "งาน" / "วันที่" because
// those appear in almost every catering chat.

const RE_CHANGE = /(ขอเปลี่ยน(?:วัน|เป็น|จาก)?|เปลี่ยนวัน|เลื่อน(?:วัน|เป็น|ไปเป็น|ไป)?|ย้ายวัน|แก้(?:วัน|เป็น))/;
const RE_CONFIRM = /(คอนเฟิร์ม|ยืนยัน(?:วัน)?|ตกลงวัน|เอาวัน(?:ที่|จัด|นี้)|จองวัน|วันจัดงานเป็น|วันจัดงานคือ|วันจัดงาน\s*[:：]?\s*\d|วันงานคือ|วันงานเป็น|เลือกวัน|โอเควัน|โอเคที่วัน)/;
const RE_INQUIRY = /(ว่าง(?:ไหม|มั้ย|ป่ะ|ปะ|มัย|หรือเปล่า|มั้ยคะ|ไหมคะ|ไหมครับ|มั้ยครับ)|ได้(?:ไหม|มั้ย|ป่ะ|ปะ)|รับ(?:งาน|วัน)[^\n]{0,40}ได้(?:ไหม|มั้ย)|สอบถาม|อยากทราบ|เช็ก(?:วัน|คิว)|check\s*คิว|ยัง(?:ว่าง|รับ))/i;

export function classifyDateIntent(text: string): DateIntent {
  const t = stripImageOcrBlocks(String(text || ""));
  if (!t.trim()) return "mention";
  // CHANGE first — "ขอเปลี่ยนวัน...ว่างไหม" is still a change intent.
  if (RE_CHANGE.test(t)) return "change";
  // If the sentence contains an inquiry marker AND no confirm verb → inquiry.
  const hasInquiry = RE_INQUIRY.test(t);
  const hasConfirm = RE_CONFIRM.test(t);
  if (hasConfirm && !hasInquiry) return "confirm";
  if (hasInquiry) return "inquiry";
  if (hasConfirm) return "confirm";
  return "mention";
}

// ---------------------------------------------------------------------------
// 2) Overwrite gate — the ONLY path that may overwrite a populated event_date
// ---------------------------------------------------------------------------

export interface EventDateOverwriteGateInput {
  anchorConfidence: "high" | "medium" | "low" | "conflict";
  anchorSource: string; // must be "customer_message" to be considered
  anchorProposedIso: string | null;
  latestCustomerMessageText: string | null;
  storedEventDate: string | null; // YYYY-MM-DD or null
}

export interface EventDateOverwriteGateResult {
  allow: boolean;
  reason: string;
  intent: DateIntent | null;
}

export function shouldAllowEventDateOverwrite(
  input: EventDateOverwriteGateInput,
): EventDateOverwriteGateResult {
  if (!input.anchorProposedIso) return { allow: false, reason: "no_proposed", intent: null };
  if (input.anchorConfidence !== "high") return { allow: false, reason: `confidence_${input.anchorConfidence}`, intent: null };
  if (input.anchorSource !== "customer_message") return { allow: false, reason: `source_${input.anchorSource}`, intent: null };
  const intent = classifyDateIntent(input.latestCustomerMessageText || "");
  if (intent === "confirm" || intent === "change") {
    // Extra guard: for "change" we still require the proposed date differs from stored.
    if (intent === "change" && input.storedEventDate && input.storedEventDate === input.anchorProposedIso) {
      return { allow: false, reason: "change_but_same_date", intent };
    }
    return { allow: true, reason: `explicit_${intent}`, intent };
  }
  return { allow: false, reason: `intent_${intent}`, intent };
}

// ---------------------------------------------------------------------------
// 3) Trigger deciders — used by line-webhook to (re)run runHandoverExtract
// ---------------------------------------------------------------------------

// Rerun on a customer message ONLY when the message expresses a confirm/change
// intent AND actually contains a Thai date pattern. The caller passes
// hasParsableDate=true when parseThaiDateCandidates(text) yielded ≥1 candidate.
export function shouldRerunExtractOnCustomerMessage(
  text: string,
  hasParsableDate: boolean,
): { rerun: boolean; reason: string; intent: DateIntent } {
  const intent = classifyDateIntent(text);
  if (!hasParsableDate) return { rerun: false, reason: "no_date_candidate", intent };
  if (intent === "confirm" || intent === "change") {
    return { rerun: true, reason: `explicit_${intent}`, intent };
  }
  return { rerun: false, reason: `intent_${intent}`, intent };
}

// Rerun on status transitions where a stale event_date could actively mislead.
// Only pending_confirm is in scope for B1.
export function shouldRerunExtractOnStatus(
  oldStatus: string | null | undefined,
  newStatus: string | null | undefined,
): { rerun: boolean; reason: string } {
  if (!newStatus || newStatus === oldStatus) return { rerun: false, reason: "no_transition" };
  if (newStatus === "pending_confirm") return { rerun: true, reason: "transition_pending_confirm" };
  return { rerun: false, reason: `transition_${newStatus}_out_of_scope` };
}

// ---------------------------------------------------------------------------
// 4) Field merger — fill_only for venue/event_type/guest_count/clv_amount,
//    special-case event_date via the overwrite gate.
// ---------------------------------------------------------------------------

export interface MergeInput {
  current: {
    event_type?: string | null;
    guest_count?: number | null;
    event_date?: string | null;
    venue?: string | null;
    clv_amount?: number | null;
  };
  extracted: {
    event_type?: string | null;
    guest_count?: number | null;
    event_date?: string | null;
    venue?: string | null;
    total_amount?: number | null;
  };
  eventDateOverwriteAllowed: boolean; // from shouldAllowEventDateOverwrite
}

export interface MergeResult {
  update: Record<string, any>;
  merged: MergeInput["current"];
  changedKeys: string[];
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

export function mergeExtractedFields(input: MergeInput): MergeResult {
  const { current, extracted, eventDateOverwriteAllowed } = input;
  const update: Record<string, any> = {};
  const merged: any = { ...current };

  // fill_only fields
  for (const f of ["event_type", "guest_count", "venue"] as const) {
    const v = (extracted as any)[f];
    if (isEmpty(v)) continue;
    if (isEmpty((current as any)[f])) {
      update[f] = v;
      merged[f] = v;
    }
  }

  // event_date: fill_only OR overwrite when gate allows
  const newDate = extracted.event_date;
  if (!isEmpty(newDate)) {
    if (isEmpty(current.event_date)) {
      update.event_date = newDate;
      merged.event_date = newDate;
    } else if (eventDateOverwriteAllowed && current.event_date !== newDate) {
      update.event_date = newDate;
      merged.event_date = newDate;
    }
  }

  // clv_amount: fill_only (>0)
  const t = Number(extracted.total_amount);
  if (Number.isFinite(t) && t > 0) {
    const cur = Number(current.clv_amount) || 0;
    if (cur === 0) {
      update.clv_amount = t;
      merged.clv_amount = t;
    }
  }

  return { update, merged, changedKeys: Object.keys(update) };
}
