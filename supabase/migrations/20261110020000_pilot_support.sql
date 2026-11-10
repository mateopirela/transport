-- I2 · Pilot support (D41): the support channel is JP's WhatsApp Business.
--
--   * Two platform settings (H3's platform_settings, read by every signed-in
--     user, written only by admin_set_platform_setting and audited):
--     support.whatsapp (E.164 phone or null) and support.hours (optional
--     text). Both start as null: the number is never in the code or the
--     seed, and without it the apps do not show "Ayuda".
--   * admin_set_platform_setting validates the two new keys.
--
-- The hombre-camión's documents (D16-E2) need no schema change: the catalog
-- (D12/D16) already asks the company, its operator row (linked to the
-- Gerente by register_company, D13) and each unit for their documents; the
-- apps show the three groups in one screen and pgTAP 52 proves the catalog.

insert into public.platform_settings (key, value, description) values
  ('support.whatsapp', 'null',
   'WhatsApp de soporte de la prueba piloto, en formato E.164 (+52…). Vacío: "Ayuda" no aparece.'),
  ('support.hours', 'null',
   'Horario de atención de soporte (texto opcional que se muestra bajo "Ayuda").')
on conflict (key) do nothing;

-- Same as H3 (…_billing.sql), except it also accepts support.whatsapp (null
-- or an E.164 phone) and support.hours (null or 1 to 200 characters, saved
-- trimmed).
create or replace function public.admin_set_platform_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change platform settings' using errcode = '42501';
  end if;
  -- PostgREST sends a JSON null argument as SQL NULL: both mean JSON null.
  p_value := coalesce(p_value, 'null'::jsonb);
  case p_key
    when 'billing.pilot_mode' then
      if jsonb_typeof(p_value) is distinct from 'boolean' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'billing.pilot_ends_at' then
      if jsonb_typeof(p_value) is distinct from 'null' and jsonb_typeof(p_value) is distinct from 'string' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
      if jsonb_typeof(p_value) = 'string' then
        begin
          perform (p_value #>> '{}')::timestamptz;
        exception when others then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end;
      end if;
    when 'billing.enforcement' then
      if jsonb_typeof(p_value) is distinct from 'string' or (p_value #>> '{}') not in ('off', 'notice', 'block') then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'support.whatsapp' then
      -- E.164 as packages/shared/src/phone.ts (E164_PATTERN); the apps build
      -- https://wa.me/<digits> from it.
      if jsonb_typeof(p_value) is distinct from 'null'
         and (jsonb_typeof(p_value) is distinct from 'string'
              or (p_value #>> '{}') !~ '^\+[1-9][0-9]{7,14}$') then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'support.hours' then
      if jsonb_typeof(p_value) = 'string' then
        -- Trimmed of any whitespace, as String.prototype.trim in the apps.
        p_value := to_jsonb(regexp_replace(p_value #>> '{}', '^\s+|\s+$', '', 'g'));
        if char_length(p_value #>> '{}') not between 1 and 200 then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(p_value) is distinct from 'null' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    else
      raise exception 'unknown setting' using errcode = '22023';
  end case;

  update public.platform_settings
  set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where key = p_key;
  if not found then
    insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, (select auth.uid()));
  end if;
end;
$$;

revoke all on function public.admin_set_platform_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_platform_setting(text, jsonb) to authenticated;
