import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres changes on multiple tables and invalidate the given
 * react-query keys whenever any change comes in (debounced ~400ms to avoid
 * thrashing during bursts).
 */
export function useRealtimeInvalidate(tables: string[], queryKeys: (string | (string | number)[])[]) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryKeys.forEach((k) => {
          qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
        });
      }, 400);
    };

    const channel = supabase.channel(`rt-${tables.join("-")}-${Math.random().toString(36).slice(2, 7)}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|"), JSON.stringify(queryKeys)]);
}
