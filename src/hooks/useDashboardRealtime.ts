import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook for Dashboard / Reports pages: subscribe to postgres changes on the
 * tables that feed those pages and invalidate ONLY the relevant react-query
 * caches (no global invalidateQueries — that caused refetch storms).
 *
 * Debounced (~2500ms) so a burst of realtime events triggers a single refetch.
 */
const DASHBOARD_QUERY_KEYS: readonly (readonly unknown[])[] = [
  ["dashboard-stats"],
  ["dashboard-lead-types-today"],
  ["dashboard-qualified-lead-types-today"],
  ["sla-breached"],
  ["top-clv"],
  ["recent-customers"],
  ["daily-report-v4"],
  ["funnel-today"],
  ["backlog-card"],
  ["current-status-grid"],
];

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
        // Invalidate only known dashboard/reports query keys (prefix match).
        for (const key of DASHBOARD_QUERY_KEYS) {
          qc.invalidateQueries({ queryKey: key as unknown[] });
        }
      }, 2500);
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
