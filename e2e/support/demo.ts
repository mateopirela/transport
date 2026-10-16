// Demo data of supabase/seed.sql (B10) that the suite relies on. See
// docs/demo-local.md. Local only: the shared password is published there.

export const DEMO_PASSWORD = 'Demo1234';

export const users = {
  admin: 'admin@demo.test',
  /** Shipper of Aceros del Norte: its MTY -> GDL trip is unloading in Guadalajara. */
  ana: 'ana.garza@demo.test',
  /** Shipper of Alimentos de Occidente: owns the GDL -> MTY return load. */
  luis: 'luis.ramirez@demo.test',
  /** Carrier of Transportes Regios del Norte. */
  jorge: 'jorge.villarreal@demo.test',
  /** Operator of Transportes Regios: drives the trip in unloading. */
  pedro: 'pedro.lopez@demo.test',
  /** Operator of Transportes Regios without an active trip. */
  raul: 'raul.mendez@demo.test',
} as const;

export type DemoUser = keyof typeof users;

export const carrierName = 'Transportes Regios del Norte';

export const ids = {
  /** Trip MTY -> GDL in `unloading`, estimated end in 2 hours (load 01). */
  unloadingTrip: '5eed0008-0000-4000-8000-000000000001',
  /** Load GDL -> MTY, published: the return trip of CS53-01 (B08). */
  returnLoad: '5eed0005-0000-4000-8000-000000000002',
  /** Dry van CS53-01 of Transportes Regios, unloading in Guadalajara. */
  dryVan: '5eed0004-0000-4000-8000-000000000002',
  /** Refrigerated trailer RF53-01 of Transportes Regios (free, in Monterrey). */
  reefer: '5eed0004-0000-4000-8000-000000000003',
  /** Operators of Transportes Regios with an account. */
  pedroOperator: '5eed0003-0000-4000-8000-000000000001',
  raulOperator: '5eed0003-0000-4000-8000-000000000002',
} as const;

/** Points used for the operator's events (D11: every event has a location). */
export const places = {
  monterrey: { lat: 25.7016, lng: -100.3392 },
  guadalajaraDelivery: { lat: 20.628, lng: -103.356 },
} as const;
