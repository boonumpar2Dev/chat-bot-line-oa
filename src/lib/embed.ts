import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: trigger embedding regeneration for a row.
 * ไม่ await — ให้ admin save เร็ว, embedding update ใน background
 */
export function triggerEmbed(
  table: "knowledge_base" | "catering_packages" | "promotions",
  id: string
) {
  if (!id) return;
  supabase.functions
    .invoke("embed-content", { body: { table, id } })
    .catch((e) => console.warn("[embed] trigger failed", e));
}

/** Rebuild embeddings ทั้งหมด — admin manual action */
export async function rebuildAllEmbeddings() {
  return supabase.functions.invoke("embed-content", { body: { rebuild: true } });
}
