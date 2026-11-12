-- I2 · Correction (verification): support hours with something visible
-- (20261110190000_support_hours_visible).
--   * admin_set_platform_setting refuses support.hours made only of white
--     space and invisible characters (zero-width spaces and joiners,
--     direction marks, the BOM, the soft hyphen, Hangul fillers, the blank
--     braille pattern, variation selectors, tags), which SQL's \s and
--     String.prototype.trim leave and "Ayuda" would show as an empty
--     schedule; the same ranges as packages/shared/src/support.ts;
--   * hours with something visible are still taken and trimmed as before,
--     invisible characters and all;
--   * support.whatsapp already refuses them (E.164 only).
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i2f.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- The call that saves p_text as the support hours.
create function tests.save_hours(p_text text)
returns text
language sql
as $$
  select format($q$ select public.admin_set_platform_setting('support.hours', %L) $q$, to_jsonb(p_text));
$$;

select tests.new_user('a5200000-0000-4000-8000-000000000001', 'shipper');
update public.profiles set role = 'admin' where id = 'a5200000-0000-4000-8000-000000000001';

set local role authenticated;
select tests.login('a5200000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Only invisible characters: refused
-- ---------------------------------------------------------------------------
select throws_ok(tests.save_hours(E'\u200B'), '22023', 'invalid value for support.hours',
  'a zero-width space is not a schedule');
select throws_ok(tests.save_hours(E'\u200B\u200B\u200B'), '22023', 'invalid value for support.hours',
  'nor several');
select throws_ok(tests.save_hours(E' \u200C\u200D\u2060 '), '22023', 'invalid value for support.hours',
  'nor joiners and word joiners between spaces');
select throws_ok(tests.save_hours(E'\uFEFF\u200E\u200F'), '22023', 'invalid value for support.hours',
  'nor the BOM and direction marks');
select throws_ok(tests.save_hours(E'\u00AD\u034F\u061C'), '22023', 'invalid value for support.hours',
  'nor the soft hyphen, the grapheme joiner and the Arabic letter mark');
select throws_ok(tests.save_hours(E'\u115F\u1160\u3164\uFFA0'), '22023', 'invalid value for support.hours',
  'nor the Hangul fillers');
select throws_ok(tests.save_hours(E'\u17B4\u17B5\u180E'), '22023', 'invalid value for support.hours',
  'nor the Khmer vowels and the Mongolian separator');
select throws_ok(tests.save_hours(E'\u202A\u202B\u202C\u202D\u202E'), '22023', 'invalid value for support.hours',
  'nor bidi embeddings');
select throws_ok(tests.save_hours(E'\u2061\u2062\u2063\u2064'), '22023', 'invalid value for support.hours',
  'nor invisible operators');
select throws_ok(tests.save_hours(E'\u2066\u2067\u2068\u2069\u206A\u206F'), '22023', 'invalid value for support.hours',
  'nor bidi isolates and deprecated format characters');
select throws_ok(tests.save_hours(E'\uFE0F\uFE00'), '22023', 'invalid value for support.hours',
  'nor variation selectors');
select throws_ok(tests.save_hours(E'\u2800'), '22023', 'invalid value for support.hours',
  'nor the blank braille pattern');
select throws_ok(tests.save_hours(E'\u00A0\u2007\u202F\u3000'), '22023', 'invalid value for support.hours',
  'nor no-break and ideographic spaces');
select throws_ok(tests.save_hours(E'\U000E0020\U000E007F\U000E0100'), '22023', 'invalid value for support.hours',
  'nor tags and supplementary variation selectors');
select throws_ok(tests.save_hours(E'\uFFF9\uFFFB'), '22023', 'invalid value for support.hours',
  'nor interlinear annotation marks');
select throws_ok(tests.save_hours(E'\u0001\u0085'), '22023', 'invalid value for support.hours',
  'nor other control characters');

-- ---------------------------------------------------------------------------
-- Something visible: taken, as before
-- ---------------------------------------------------------------------------
select lives_ok(tests.save_hours(E'\u200BLunes a viernes\u200B'),
  'a schedule with zero-width spaces around it is taken');
select lives_ok(tests.save_hours(E'☎\uFE0F 24 horas'), 'an emoji with its variation selector is visible');
select lives_ok(tests.save_hours(E'  Lunes a sábado, 8:00 a 20:00\n'), 'plain hours are taken');
reset role;

select is(
  (select value from public.platform_settings where key = 'support.hours'),
  '"Lunes a sábado, 8:00 a 20:00"'::jsonb,
  'and trimmed as before'
);

-- ---------------------------------------------------------------------------
-- The number is E.164 only
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a5200000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.admin_set_platform_setting('support.whatsapp', %L) $$, to_jsonb(E'\u200B'::text)),
  '22023', 'invalid value for support.whatsapp', 'a zero-width space is not a number');
select throws_ok(
  format($$ select public.admin_set_platform_setting('support.whatsapp', %L) $$, to_jsonb(E'+528112345678\u200B'::text)),
  '22023', 'invalid value for support.whatsapp', 'nor a number with one after it');
reset role;

select * from finish();
rollback;
