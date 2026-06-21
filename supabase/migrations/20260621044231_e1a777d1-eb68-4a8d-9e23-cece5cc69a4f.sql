create or replace function public.ai_token_usage_totals(p_from timestamptz default null, p_to timestamptz default null)
returns table(total_cost numeric, total_tokens bigint, total_calls bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd),0)::numeric, coalesce(sum(total_tokens),0)::bigint, count(*)::bigint
  from public.ai_token_usage
  where (p_from is null or created_at >= p_from)
    and (p_to is null or created_at <= p_to);
$$;
grant execute on function public.ai_token_usage_totals(timestamptz, timestamptz) to authenticated, service_role;