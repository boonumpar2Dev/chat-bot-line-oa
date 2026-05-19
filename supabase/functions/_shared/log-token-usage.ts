// Log AI token usage to ai_token_usage table
// Prices: USD per 1M tokens (input / output) — sync with Lovable AI Gateway docs
// Update this map when pricing changes.
const PRICING: Record<string, { in: number; out: number }> = {
  "google/gemini-3-flash-preview": { in: 0.30, out: 2.50 },
  "google/gemini-3.1-flash-image-preview": { in: 0.30, out: 2.50 },
  "google/gemini-3-pro-image-preview": { in: 2.00, out: 12.00 },
  "google/gemini-3.1-pro-preview": { in: 2.00, out: 12.00 },
  "google/gemini-2.5-flash": { in: 0.30, out: 2.50 },
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "google/gemini-2.5-pro": { in: 1.25, out: 10.00 },
  "openai/gpt-5": { in: 1.25, out: 10.00 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.00 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.40 },
  "openai/gpt-5.2": { in: 1.25, out: 10.00 },
};

export function computeCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model] || { in: 0.30, out: 2.50 }; // fallback to flash pricing
  return (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
}

export async function logTokenUsage(
  supabase: any,
  opts: {
    model: string;
    source: string;
    apiResponse: any;
    customerId?: string | null;
    meta?: Record<string, any>;
  }
): Promise<void> {
  try {
    const usage = opts.apiResponse?.usage || {};
    const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
    if (promptTokens === 0 && completionTokens === 0) return;
    const costUsd = computeCostUsd(opts.model, promptTokens, completionTokens);
    await supabase.from("ai_token_usage").insert({
      model: opts.model,
      source: opts.source,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
      customer_id: opts.customerId || null,
      meta: opts.meta || {},
    });
  } catch (e: any) {
    console.warn("[logTokenUsage] failed:", e?.message);
  }
}
