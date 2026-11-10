// "Ayuda" inside a trip (I2): the account menu reads the trip from the
// address, so the WhatsApp message carries its folio without a query.

const TRIP_PATH =
  /^\/(?:cliente|transportista)\/viajes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/iu;

/** The trip id of a shipper's or carrier's trip page (and its sub-pages), or null. */
export function tripIdFromPath(pathname: string | null | undefined): string | null {
  if (typeof pathname !== 'string') return null;
  return TRIP_PATH.exec(pathname)?.[1] ?? null;
}
