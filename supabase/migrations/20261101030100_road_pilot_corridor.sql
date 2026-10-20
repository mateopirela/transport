-- H4 · Reference data of the pilot corridor MTY ↔ GDL (D31), in a migration
-- so it exists in production too. Admins correct it from /admin/carreteras.
--
-- Rules (H.0.5): every row is `estimated`; nothing is invented.
--   * Distances: straight line between the city centers × the road factor
--     the matching uses (1.3), rounded. The source says so.
--   * Tolls: only the tariffs published by CAPUFE (Red FONADIN, tariffs in
--     force since 2026-04-13, VAT included). Segments that charge tolls
--     under a private concession, whose tariffs we could not back with a
--     published source, keep `is_toll` and no amount ("Sin dato").
--   * Risks: none. We found no public, dated source per segment and hour
--     band (SESNSP publishes by municipality and month), so they stay empty
--     until JP or an admin adds them with their source.
--
-- Idempotent (on conflict do nothing on the codes) so a re-run is harmless.

insert into public.road_segments (
  code, name, highway, from_city, from_state, from_lat, from_lng, to_city, to_state, to_lat, to_lng,
  distance_km, is_toll, notes, source, source_url, source_date, data_status
) values
  ('MTY-SAL', 'Monterrey – Saltillo', '40D', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
   'Saltillo', 'Coahuila', 25.4383, -100.9737, 93, true,
   'Autopista de cuota; tarifa por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('SAL-MAT', 'Saltillo – Matehuala', '57', 'Saltillo', 'Coahuila', 25.4383, -100.9737,
   'Matehuala', 'San Luis Potosí', 23.6489, -100.6436, 262, true,
   'Incluye la plaza Los Chorros (La Carbonera – Puerto México), de CAPUFE.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('MAT-SLP', 'Matehuala – San Luis Potosí', '57', 'Matehuala', 'San Luis Potosí', 23.6489, -100.6436,
   'San Luis Potosí', 'San Luis Potosí', 22.1565, -100.9855, 220, false,
   'Sin casetas conocidas; por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('SLP-LAG', 'San Luis Potosí – Lagos de Moreno', '80D', 'San Luis Potosí', 'San Luis Potosí', 22.1565, -100.9855,
   'Lagos de Moreno', 'Jalisco', 21.3564, -101.9356, 172, true,
   'Plaza Lagos de Moreno, de CAPUFE.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('LAG-ZAP', 'Lagos de Moreno – Zapotlanejo', '80D', 'Lagos de Moreno', 'Jalisco', 21.3564, -101.9356,
   'Zapotlanejo', 'Jalisco', 20.6228, -103.0692, 186, true,
   'Autopista de cuota concesionada; tarifa por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('ZAP-GDL', 'Zapotlanejo – Guadalajara', '90', 'Zapotlanejo', 'Jalisco', 20.6228, -103.0692,
   'Guadalajara', 'Jalisco', 20.6597, -103.3496, 38, true,
   'Tarifa por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('SAL-ZAC', 'Saltillo – Zacatecas', '54', 'Saltillo', 'Coahuila', 25.4383, -100.9737,
   'Zacatecas', 'Zacatecas', 22.7709, -102.5832, 440, false,
   'Sin casetas conocidas; por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('ZAC-AGS', 'Zacatecas – Aguascalientes', '45', 'Zacatecas', 'Zacatecas', 22.7709, -102.5832,
   'Aguascalientes', 'Aguascalientes', 21.8853, -102.2916, 134, true,
   'Tarifa por confirmar.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated'),
  ('AGS-LAG', 'Aguascalientes – Lagos de Moreno', '45', 'Aguascalientes', 'Aguascalientes', 21.8853, -102.2916,
   'Lagos de Moreno', 'Jalisco', 21.3564, -101.9356, 90, true,
   'Por confirmar si se usa la cuota.',
   'Estimado: distancia en línea recta × 1.3', null, '2026-10-20', 'estimated')
on conflict (code) do nothing;

-- CAPUFE, Red FONADIN: tarifas vigentes 2026 (con IVA), in force since
-- 2026-04-13. Pesos per truck class C2 … C9.
with tariffs (code, plaza, amounts) as (
  values
    ('SAL-MAT', 'Los Chorros (La Carbonera – Puerto México)', array[196, 196, 196, 306, 306, 380, 380, 380]),
    ('SLP-LAG', 'Lagos de Moreno (Lagos de Moreno – San Luis Potosí)', array[299, 299, 299, 442, 442, 617, 617, 617])
),
classes (vehicle_class, n) as (
  select c, n from unnest(enum_range(null::public.toll_vehicle_class)) with ordinality u (c, n)
)
insert into public.road_segment_tolls (segment_id, vehicle_class, amount_cents, source, source_url, valid_from, data_status)
select s.id, classes.vehicle_class, t.amounts[classes.n] * 100,
       'CAPUFE · Red FONADIN, tarifas vigentes 2026 (con IVA), plaza ' || t.plaza,
       'https://pot.capufe.mx/gobmx/transparencia/Doc/TransparenciaF/Tarifas/Vigentes/2026/Tarifas-vigentes-2026.pdf',
       '2026-04-13', 'estimated'
from tariffs t
join public.road_segments s on s.code = t.code
cross join classes
on conflict (segment_id, vehicle_class, valid_from) do nothing;

insert into public.road_corridors (
  code, name, origin_city, origin_state, origin_lat, origin_lng, origin_radius_km,
  destination_city, destination_state, destination_lat, destination_lng, destination_radius_km, bidirectional
) values
  ('MTY-GDL-SLP', 'MTY–GDL por Saltillo y San Luis Potosí', 'Monterrey', 'Nuevo León', 25.6866, -100.3161, 60,
   'Guadalajara', 'Jalisco', 20.6597, -103.3496, 60, true),
  ('MTY-GDL-ZAC', 'MTY–GDL por Zacatecas y Aguascalientes', 'Monterrey', 'Nuevo León', 25.6866, -100.3161, 60,
   'Guadalajara', 'Jalisco', 20.6597, -103.3496, 60, true)
on conflict (code) do nothing;

with ways (corridor, segments) as (
  values
    ('MTY-GDL-SLP', array['MTY-SAL', 'SAL-MAT', 'MAT-SLP', 'SLP-LAG', 'LAG-ZAP', 'ZAP-GDL']),
    ('MTY-GDL-ZAC', array['MTY-SAL', 'SAL-ZAC', 'ZAC-AGS', 'AGS-LAG', 'LAG-ZAP', 'ZAP-GDL'])
)
insert into public.road_corridor_segments (corridor_id, seq, segment_id)
select c.id, u.n::smallint, s.id
from ways w
join public.road_corridors c on c.code = w.corridor
cross join lateral unnest(w.segments) with ordinality u (code, n)
join public.road_segments s on s.code = u.code
on conflict do nothing;
