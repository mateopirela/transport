-- Matching on the demo seed (B08 acceptance): the unit unloading in
-- Guadalajara gets the GDL -> MTY load as its first recommendation.
--
--   supabase test db supabase/seed-tests
--
-- The final order (score) is computed by the Edge Function with
-- packages/shared/matching; its tests reproduce this scenario. Here the
-- database side: candidates, return-trip mode and the ingredients.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

set local role authenticated;
-- Jorge Villarreal, carrier of Transportes Regios del Norte.
select set_config(
  'request.jwt.claims',
  '{"sub": "5eed0001-0000-4000-8000-000000000005", "role": "authenticated"}',
  true
);

select is(
  (select load_id from public.match_candidates('5eed0004-0000-4000-8000-000000000002') limit 1),
  '5eed0005-0000-4000-8000-000000000002'::uuid,
  'the dry van unloading in Guadalajara gets the GDL -> MTY load first'
);
select results_eq(
  $$ select start_city, is_return_trip, available_from = (select estimated_unload_end_at from public.trips
                                                          where id = '5eed0008-0000-4000-8000-000000000001')
     from public.match_candidates('5eed0004-0000-4000-8000-000000000002') $$,
  $$ values ('Guadalajara'::text, true, true) $$,
  'return-trip mode: it starts in Guadalajara at the estimated end of unloading'
);
select ok(
  (select empty_km < 10 and home_distance_km < 30 and route_origin_city = 'Guadalajara'
          and route_destination_city = 'Monterrey'
   from public.match_candidates('5eed0004-0000-4000-8000-000000000002')
   where load_id = '5eed0005-0000-4000-8000-000000000002'),
  'few empty km, it ends near the base (Monterrey) and follows the usual route GDL -> MTY'
);
select is_empty(
  $$ select 1 from public.match_candidates('5eed0004-0000-4000-8000-000000000003') $$,
  'the refrigerated unit in Monterrey has no compatible open load nearby'
);

-- Fletes Tapatíos: its flatbed has a document in review, so it is not matched.
select set_config(
  'request.jwt.claims',
  '{"sub": "5eed0001-0000-4000-8000-000000000006", "role": "authenticated"}',
  true
);
select is_empty(
  $$ select 1 from public.match_candidates('5eed0004-0000-4000-8000-000000000006') $$,
  'a unit with a document in review is not matched'
);

select * from finish();
rollback;
