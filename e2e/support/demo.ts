// Demo data of supabase/seed.sql (B10) that the suite relies on. See
// docs/demo-local.md. Local only: the shared password is published there.

export const DEMO_PASSWORD = 'Demo1234';

export const users = {
  admin: 'admin@demo.test',
  /** Shipper of Aceros del Norte: its MTY -> GDL trip is unloading in Guadalajara. */
  ana: 'ana.garza@demo.test',
  /** Shipper of Alimentos de Occidente: owns the GDL -> MTY return load. */
  luis: 'luis.ramirez@demo.test',
  /** Shipper of Empaques Plásticos Regios: owns the León -> Apodaca load. */
  sofia: 'sofia.trevino@demo.test',
  /** Gerente of Transportes Regios del Norte: operates both business units. */
  jorge: 'jorge.villarreal@demo.test',
  /** Coordinadora of TRN's "Corredor MTY–GDL": TRN-01, CS53-01 and Pedro. */
  andrea: 'andrea.cavazos@demo.test',
  /** Coordinador of TRN's "Regional Monterrey": RF53-01, TT-01, Raúl and Arturo. */
  hector: 'hector.ibarra@demo.test',
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
  /** Load Tlaquepaque -> San Nicolás, published, refrigerated: only read (share-links.spec.ts). */
  reeferLoad: '5eed0005-0000-4000-8000-000000000003',
  /** Load León -> Apodaca, published, dry van: nobody has offered on it. */
  leonLoad: '5eed0005-0000-4000-8000-000000000004',
  /** Load MTY -> Tlaquepaque, published, flatbed: nobody has offered on it. */
  flatbedLoad: '5eed0005-0000-4000-8000-000000000005',
  /** Dry van CS53-01 of Transportes Regios, unloading in Guadalajara. */
  dryVan: '5eed0004-0000-4000-8000-000000000002',
  /** Refrigerated trailer RF53-01 of Transportes Regios (free, in Monterrey). */
  reefer: '5eed0004-0000-4000-8000-000000000003',
  /** Operators of Transportes Regios with an account. */
  pedroOperator: '5eed0003-0000-4000-8000-000000000001',
  raulOperator: '5eed0003-0000-4000-8000-000000000002',
  /** "Regional Monterrey", the second business unit of Transportes Regios (G1a). */
  regionalUnit: '5eed0009-0000-4000-8000-000000000002',
} as const;

/** Points used for the operator's events (D11: every event has a location). */
export const places = {
  monterrey: { lat: 25.7016, lng: -100.3392 },
  guadalajaraDelivery: { lat: 20.628, lng: -103.356 },
} as const;
