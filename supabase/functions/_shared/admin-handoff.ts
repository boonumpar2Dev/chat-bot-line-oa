// Patch 2.9.1 — Shared helper for resolving admin handoff decision.
//
// Pure function that centralises the "should we disable AI (ai_active=false)
// on this customer patch?" logic. Both call-sites in line-webhook previously
// duplicated the same rule:
//
//   if (!freshCustomer.admin_bot_override) patch.ai_active = false;
//
// This helper does NOT change behavior — it only consolidates the check so
// tests can lock it in and future call-sites use one source of truth.
//
// Behavior contract (must match legacy call-sites exactly):
//   - admin_bot_override === true  → disableAi = false (respect admin decision)
//   - anything else (false/null/undefined) → disableAi = true

export type AdminHandoffReason =
  | "confirm_existing_phone" // AI asks to confirm existing phone → short manual mute
  | "handover_promise";      // AI text promised to hand off to human staff

export interface AdminHandoffInput {
  adminBotOverride: boolean | null | undefined;
  reason: AdminHandoffReason;
}

export interface AdminHandoffDecision {
  /** Whether caller should set ai_active=false on the customer patch. */
  disableAi: boolean;
  /** Human-readable reason for logging (matches legacy console.log strings). */
  logMessage: string;
}

export function resolveAdminHandoffDecision(
  input: AdminHandoffInput,
): AdminHandoffDecision {
  const override = input.adminBotOverride === true;

  if (override) {
    return {
      disableAi: false,
      logMessage:
        input.reason === "handover_promise"
          ? "[Handover] AI promised staff handover — skip disable (admin_bot_override=true)"
          : "[ConfirmPhone] short mute — skip ai_active flip (admin_bot_override=true)",
    };
  }

  return {
    disableAi: true,
    logMessage:
      input.reason === "handover_promise"
        ? "[Handover] AI promised staff handover → ai_active=false"
        : "[ConfirmPhone] short mute → ai_active=false",
  };
}
