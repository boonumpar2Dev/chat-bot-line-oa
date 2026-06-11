import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Smart back navigation.
 * - If the user arrived via a link that passed `state.from`, navigate back to that URL.
 * - Otherwise navigate to the provided fallback path.
 *
 * Usage:
 *   const goBack = useSmartBack("/customers");
 *   <Button onClick={goBack}>back</Button>
 *
 * To enable this on a link, pass state when navigating:
 *   <Link to={`/customers/${id}`} state={{ from: location.pathname + location.search }} />
 *   nav(`/customers/${id}`, { state: { from: location.pathname + location.search } })
 */
export function useSmartBack(fallback: string) {
  const nav = useNavigate();
  const loc = useLocation();
  return useCallback(() => {
    const from = (loc.state as any)?.from as string | undefined;
    if (from && typeof from === "string") {
      nav(from);
    } else {
      nav(fallback);
    }
  }, [nav, loc.state, fallback]);
}

/** Build a `from` state object capturing the current URL — pass to <Link state={...}> / navigate(..., {state}). */
export function fromState(loc: { pathname: string; search?: string }) {
  return { from: (loc.pathname || "") + (loc.search || "") };
}
