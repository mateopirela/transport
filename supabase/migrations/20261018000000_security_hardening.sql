-- B24 · Security audit: hardening found by the audit.
--
--   * Deny by default: tables, views and sequences that later migrations
--     create in `public` no longer get every privilege for anon and
--     authenticated (Supabase's default). A migration that forgets its
--     `revoke` now leaves the object closed instead of open (TRUNCATE, for
--     example, is not covered by RLS). Each block already grants explicitly
--     what its clients need.
--   * Rate limits for the Edge Functions: a fixed-window counter per
--     (bucket, subject). `recommendations` limits each user (it is the one
--     that spends the Google Routes budget) and `dispatch-notifications`
--     limits the runs triggered with the dispatch secret.
--
-- Functions are not covered by the default-privilege change: PUBLIC's EXECUTE
-- on new functions is a global default that a per-schema rule cannot remove.
-- The pgTAP suite (00 and 17) catches any security definer function that
-- anon can run or that authenticated can run without being reviewed.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- Limits per bucket. `scope` says who may consume it: 'user' buckets are keyed
-- by the caller's auth.uid() (consume_rate_limit); 'service' buckets by a
-- subject that the Edge Function passes with the service role
-- (consume_service_rate_limit).
create function public.rate_limit_policy(
  p_bucket text,
  out scope text,
  out max_hits integer,
  out window_seconds integer
)
language sql
immutable
set search_path = ''
as $$
  select v.scope, v.max_hits, v.window_seconds
  from (values
    -- B08: each call can spend up to 2 x top N Google Routes requests.
    ('recommendations', 'user', 30, 60),
    -- B09: pg_cron calls it once a minute; the margin covers manual runs.
    ('dispatch-notifications', 'service', 10, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;

create table public.rate_limit_counters (
  bucket text not null,
  subject text not null constraint rate_limit_counters_subject_length check (char_length(subject) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null constraint rate_limit_counters_hits check (hits >= 0),
  primary key (bucket, subject)
);

comment on table public.rate_limit_counters is
  'Fixed-window counters of the Edge Function rate limits (B24). One row per bucket and subject; '
  'no client access, only consume_rate_limit / consume_service_rate_limit.';

-- No policies: nobody reads or writes it directly (the RPCs are security
-- definer and the service role never touches it outside them).
alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from public, anon, authenticated, service_role;

-- Counts one hit and returns 0 when it is allowed, or the seconds until the
-- window resets when the limit is exceeded. The upsert locks the row, so
-- concurrent hits of the same subject are counted one after another. The
-- effective window is decided under that lock and never moves backward: a
-- call that computed its window just before the minute changed, and reaches
-- the row after a newer window was stored, is counted in the newer window
-- instead of resetting it. p_now exists only so tests control the clock.
create function public.rate_limit_hit(
  p_bucket text,
  p_subject text,
  p_max_hits integer,
  p_window_seconds integer,
  p_now timestamptz default null
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_hits integer;
begin
  insert into public.rate_limit_counters as c (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject) do update
  set hits = case
               when excluded.window_start > c.window_start then 1
               else least(c.hits, p_max_hits) + 1
             end,
      window_start = greatest(c.window_start, excluded.window_start)
  returning c.hits, c.window_start into v_hits, v_window;

  if v_hits <= p_max_hits then
    return 0;
  end if;
  return greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer);
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer, timestamptz)
  from public, anon, authenticated, service_role;

-- RPC for the Edge Functions that run with the caller's JWT.
create function public.consume_rate_limit(p_bucket text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_policy record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_policy from public.rate_limit_policy(p_bucket);
  if v_policy.scope is distinct from 'user' then
    raise exception 'unknown rate limit bucket' using errcode = '22023';
  end if;
  return public.rate_limit_hit(p_bucket, v_uid::text, v_policy.max_hits, v_policy.window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- RPC for the Edge Functions that run with the service role (no user JWT).
create function public.consume_service_rate_limit(p_bucket text, p_subject text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_policy record;
begin
  select * into v_policy from public.rate_limit_policy(p_bucket);
  if v_policy.scope is distinct from 'service' then
    raise exception 'unknown rate limit bucket' using errcode = '22023';
  end if;
  if p_subject is null or char_length(p_subject) not between 1 and 200 then
    raise exception 'invalid rate limit subject' using errcode = '22023';
  end if;
  return public.rate_limit_hit(p_bucket, p_subject, v_policy.max_hits, v_policy.window_seconds);
end;
$$;

revoke all on function public.consume_service_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_service_rate_limit(text, text) to service_role;
