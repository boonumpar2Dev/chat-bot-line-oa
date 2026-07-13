// Patch 2.9.1 — Shared helper for resolving admin handoff decision.
//
// Pure function that centralises the "should we disable AI (ai_active=false)
// on this customer patch?" logic. Now supports two behavior classes:
//
//   • LEGACY reasons ("confirm_existing_phone", "handover_promise")
//     → respect admin_bot_override=true (skip disable). This preserves the
//       exact behavior of the two legacy call-sites in line-webhook so
//       admins who opted out of auto-mute stay opted-out.
//
//   • EXPLICIT reason ("admin_handoff_guard")
//     → FORCE disableAi=true regardless of admin_bot_override, because
//       AdminHandoffGuard (Patch 2.9.1 behavior guard) is a deliberate
//       handoff triggered by a matched customer intent — the customer has
//       asked for a change/staff action and the human must take over.
//
// This helper does not decide WHEN to hand off — callers decide that.
// It only centralises the "disable AI vs respect override" rule.

export type AdminHandoffReason =
  | "confirm_existing_phone" // legacy: AI asks to confirm existing phone
  | "handover_promise"       // legacy: AI text promised to hand off
  | "admin_handoff_guard";   // 2.9.1: explicit change/staff-action guard match

export interface AdminHandoffInput {
  adminBotOverride: boolean | null | undefined;
  reason: AdminHandoffReason;
}

export interface AdminHandoffDecision {
  /** Whether caller should set ai_active=false on the customer patch. */
  disableAi: boolean;
  /** Human-readable reason for logging. */
  logMessage: string;
  /** True when override was honored (legacy reasons only). */
  overrideRespected: boolean;
}

export function resolveAdminHandoffDecision(
  input: AdminHandoffInput,
): AdminHandoffDecision {
  const override = input.adminBotOverride === true;

  // Explicit guard: force disable regardless of override.
  if (input.reason === "admin_handoff_guard") {
    return {
      disableAi: true,
      overrideRespected: false,
      logMessage: override
        ? "[AdminHandoffGuard] matched — force ai_active=false (override=true ignored by design)"
        : "[AdminHandoffGuard] matched → ai_active=false",
    };
  }

  // Legacy reasons: respect override.
  if (override) {
    return {
      disableAi: false,
      overrideRespected: true,
      logMessage:
        input.reason === "handover_promise"
          ? "[Handover] AI promised staff handover — skip disable (admin_bot_override=true)"
          : "[ConfirmPhone] short mute — skip ai_active flip (admin_bot_override=true)",
    };
  }

  return {
    disableAi: true,
    overrideRespected: false,
    logMessage:
      input.reason === "handover_promise"
        ? "[Handover] AI promised staff handover → ai_active=false"
        : "[ConfirmPhone] short mute → ai_active=false",
  };
}
