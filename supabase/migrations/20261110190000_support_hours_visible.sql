-- I2 · Correction (verification): support hours with something visible.
--
-- admin_set_platform_setting trimmed support.hours with \s, which leaves the
-- invisible format characters (U+200B and the like): a value made only of
-- them was saved, and "Ayuda" showed an empty schedule. Now the hours need
-- at least one character outside the ranges below, the same as
-- INVISIBLE_RANGES in packages/shared/src/support.ts (from U+0001: Postgres
-- text holds no NUL): white space and the other controls, the soft hyphen,
-- the grapheme joiner, the Arabic letter mark, the Hangul fillers, the Khmer
-- inherent vowels, the Mongolian selectors and separator, zero-width spaces
-- and joiners, direction marks and embeddings, the word joiner and invisible
-- operators, the blank braille pattern, variation selectors, the BOM,
-- interlinear annotation marks, shorthand and musical format controls, and
-- tags. Hours with something visible are taken and trimmed as before.
-- support.whatsapp already refuses them (E.164 only).
--
-- Same as I4 (20261110100100_quick_pay.sql) otherwise.
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
        -- And at least one character shows, not only invisible ones.
        if char_length(p_value #>> '{}') not between 1 and 200
           or (p_value #>> '{}') !~ (
                '[^'
                '\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5'
                '\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164'
                '\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A'
                '\U000E0000-\U000E007F\U000E0100-\U000E01EF'
                ']') then
          raise exception 'invalid value for %', p_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(p_value) is distinct from 'null' then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'freight.commission_bps' then
      if not public.freight_is_valid_commission(p_value) then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'freight.quick_pay_fee_bps' then
      if not public.freight_is_valid_quick_pay_fee(p_value) then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'freight.quick_pay_exposure_limit_cents' then
      if not public.freight_is_valid_exposure_limit(p_value) then
        raise exception 'invalid value for %', p_key using errcode = '22023';
      end if;
    when 'fulmis.rfc', 'fulmis.legal_name', 'fulmis.tax_regime', 'fulmis.zip' then
      if jsonb_typeof(p_value) = 'string' then
        p_value := to_jsonb(regexp_replace(p_value #>> '{}', '^\s+|\s+$', '', 'g'));
        if p_key = 'fulmis.rfc' then
          p_value := to_jsonb(upper(p_value #>> '{}'));
        end if;
        if (p_key = 'fulmis.rfc' and (p_value #>> '{}') !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$')
           or (p_key = 'fulmis.legal_name' and char_length(p_value #>> '{}') not between 1 and 300)
           or (p_key = 'fulmis.tax_regime' and (p_value #>> '{}') !~ '^[0-9]{3}$')
           or (p_key = 'fulmis.zip' and (p_value #>> '{}') !~ '^[0-9]{5}$') then
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
