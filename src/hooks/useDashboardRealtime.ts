import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for Dashboard / Reports pages: subscribe to postgres changes on the
 * tables that feed those pages and invalidate all react-query caches so the
 * UI re-fetches automatically (no manual refresh needed).
 *
 * Debounced (~500ms) to batch bursts of changes.
 */
export function useDashboardRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const tables = [
      "customers",
      "customer_status_log",
      "customer_events",
      "conversations",
    ];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries();
      }, 500);
    };

    const channel = supabase.channel(`dashboard-rt-${Math.random().toString(36).slice(2, 8)}`);
    tables.forEach((t) => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t },
        invalidate
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
