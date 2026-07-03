// Shared helper: resolve admin-reply pause duration.
// During live rollout (before live_rollout_until) with a valid
// live_admin_pause_minutes, use a short pause. Otherwise fall back
// to legacy manual_chat_hours behavior (default 360h = 15 days).

export type AdminPauseSettings = {
  manual_chat_hours?: number | null;
  ai_policy_config?: {
    live_rollout_enabled?: boolean;
    live_rollout_until?: string | null;
    live_admin_pause_minutes?: number | null;
  } | null;
};

export type AdminPauseResult = {
  ms: number;
  mode: "live_short_pause" | "legacy_long_pause";
  minutes: number;
};

const LEGACY_DEFAULT_HOURS = 360;

export function resolveAdminPauseMs(
  _customerId: string | null | undefined,
  settings: AdminPauseSettings | null | undefined,
  now: Date = new Date(),
): AdminPauseResult {
  const policy = settings?.ai_policy_config ?? null;
  const enabled = policy?.live_rollout_enabled === true;
  const untilStr = policy?.live_rollout_until ?? null;
  const rawMin = policy?.live_admin_pause_minutes;
  const shortMin = typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0
    ? rawMin
    : null;

  let withinWindow = false;
  if (enabled && untilStr) {
    const untilTs = Date.parse(untilStr);
    if (Number.isFinite(untilTs) && untilTs > now.getTime()) {
      withinWindow = true;
    }
  }

  if (enabled && withinWindow && shortMin !== null) {
    return {
      ms: Math.round(shortMin * 60_000),
      mode: "live_short_pause",
      minutes: shortMin,
    };
  }

  const rawHours = settings?.manual_chat_hours;
  const hours = typeof rawHours === "number" && Number.isFinite(rawHours) && rawHours > 0
    ? rawHours
    : LEGACY_DEFAULT_HOURS;
  return {
    ms: Math.round(hours * 3_600_000),
    mode: "legacy_long_pause",
    minutes: hours * 60,
  };
}
