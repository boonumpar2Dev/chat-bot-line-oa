// Browser notification sound — synthesized via WebAudio (no asset files needed).
// Settings stored in localStorage per browser/device.
import { useCallback, useEffect, useState } from "react";

export type SoundType = "ding" | "chime" | "pop";

const STORAGE_KEY = "notification:settings";

export type NotificationSettings = {
  enabled: boolean;
  sound: SoundType;
  volume: number; // 0–1
};

const DEFAULTS: NotificationSettings = { enabled: true, sound: "ding", volume: 0.6 };

export function readNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function writeNotificationSettings(s: NotificationSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  return _ctx;
}

// Synthesize a short tone with envelope. Reuses single AudioContext.
function playTone(ctx: AudioContext, freq: number, durationMs: number, volume: number, type: OscillatorType = "sine", startOffset = 0) {
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Quick attack + exponential decay (bell-like)
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export function playNotificationSound(sound: SoundType, volume = 0.6) {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const v = Math.max(0, Math.min(1, volume)) * 0.4; // cap to avoid clipping
  if (sound === "ding") {
    playTone(ctx, 880, 350, v, "sine");
  } else if (sound === "chime") {
    playTone(ctx, 784, 280, v, "sine", 0);     // G5
    playTone(ctx, 1047, 380, v * 0.9, "sine", 0.12); // C6
  } else if (sound === "pop") {
    playTone(ctx, 320, 90, v, "triangle");
    playTone(ctx, 520, 70, v * 0.7, "triangle", 0.04);
  }
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(readNotificationSettings);
  useEffect(() => { writeNotificationSettings(settings); }, [settings]);
  const update = useCallback((patch: Partial<NotificationSettings>) =>
    setSettings(prev => ({ ...prev, ...patch })), []);
  const test = useCallback(() => playNotificationSound(settings.sound, settings.volume), [settings]);
  return { settings, update, test };
}
