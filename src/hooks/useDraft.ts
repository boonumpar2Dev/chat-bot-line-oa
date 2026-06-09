import { useEffect, useRef, useState, useCallback } from "react";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PREFIX = "lovable-draft:";

type DraftEnvelope<T> = { v: T; savedAt: number };

export function readDraft<T>(key: string): { value: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: DraftEnvelope<T> = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return { value: parsed.v, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T) {
  try {
    const env: DraftEnvelope<T> = { v: value, savedAt: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    /* quota — ignore */
  }
}

export function clearDraft(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
}

/**
 * Auto-save draft of `value` to localStorage while `enabled` is true.
 * - Debounced (default 800ms)
 * - Skips initial mount (no save until user actually edits)
 * - Use `isDirty(initial)` to gate
 */
export function useAutoSaveDraft<T>(
  key: string,
  value: T,
  enabled: boolean,
  opts?: { debounceMs?: number; isDirty?: boolean }
) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const debounceMs = opts?.debounceMs ?? 800;
  const isDirty = opts?.isDirty ?? true;

  useEffect(() => {
    if (!enabled || !isDirty) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      writeDraft(key, value);
      setSavedAt(Date.now());
    }, debounceMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [key, value, enabled, isDirty, debounceMs]);

  // Reset indicator when dialog closes
  useEffect(() => { if (!enabled) setSavedAt(null); }, [enabled]);

  const clear = useCallback(() => { clearDraft(key); setSavedAt(null); }, [key]);

  return { savedAt, clear };
}

export function formatAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "เมื่อกี้";
  if (s < 60) return `${s} วิที่แล้ว`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
}
