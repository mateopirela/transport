-- B12 · Shipper onboarding and admin verification panel.
--
-- * admin_list_users: the admin panel lists and searches users with their
--   email, which lives in auth.users and is not readable through the API.
--   This admin-only RPC exposes just the columns the panel needs. Suspending
--   and reactivating act on the user's company through review_company (B03).
-- * request_company_review: a rejected company whose documents are fine (it
--   was rejected for its data) corrects it and asks for another review.
--   submit_document (B03) already does this when new documents arrive.
-- No new tables.

create function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  role public.user_role,
  company_id uuid,
  company_legal_name text,
  company_rfc text,
  company_type public.company_type,
  company_status public.verification_status,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_pattern text;
begin
  if not public.is_admin() then
    raise exception 'only admins can list users' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'offset must not be negative' using errcode = '22023';
  end if;
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'search is too long' using errcode = '22023';
  end if;

  -- Match the text literally: escape the LIKE wildcards typed by the admin.
  v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.role,
    c.id,
    c.legal_name,
    c.rfc,
    c.type,
    c.status,
    p.created_at,
    u.last_sign_in_at,
    count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.companies c on c.id = p.company_id
  where v_search is null
     or u.email ilike v_pattern
     or p.full_name ilike v_pattern
     or c.legal_name ilike v_pattern
     or c.rfc ilike v_pattern
  order by p.created_at desc, p.id
  limit p_limit
  offset p_offset;
end;
$$;

comment on function public.admin_list_users(text, integer, integer) is
  'Admin-only, paginated user directory with email and company (B12).';

revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: request_company_review
--   rejected -> pending_review, by a shipper/carrier member of the company.
--   The admin's previous reason is kept in status_reason until the next
--   decision, so the reviewer still sees why it was rejected.
-- ---------------------------------------------------------------------------
create function public.request_company_review()
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.auth_role();
  v_company public.companies%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('shipper', 'carrier') then
    raise exception 'only shipper or carrier members can request a review' using errcode = '42501';
  end if;

  -- Same lock as review_company, so a concurrent admin decision serializes.
  select * into v_company from public.companies
  where id = public.auth_company_id() and archived_at is null
  for update;
  if not found then
    raise exception 'caller has no active company' using errcode = '42501';
  end if;
  if v_company.status <> 'rejected' then
    raise exception 'cannot request a review in status %', v_company.status using errcode = '55000';
  end if;

  update public.companies set status = 'pending_review' where id = v_company.id;
  return 'pending_review';
end;
$$;

revoke all on function public.request_company_review() from public, anon;
grant execute on function public.request_company_review() to authenticated;
