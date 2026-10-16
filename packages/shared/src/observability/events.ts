// Product events (B25). The pilot KPIs (producto §5) that the domain already
// records are computed by the kpi_* views (B16) from loads, offers and trips.
// These events cover what the domain does not store: the recommendation
// funnel, i.e. whether a carrier saw and opened a recommended load (a return
// trip, ideally) before offering on it. They are written only through the
// track_product_event RPC, which accepts exactly these names and properties.
import { z } from 'zod';

import type { Enums, Json } from '../db';

export type ProductEventName = Enums<'product_event_name'>;

const uuid = z.uuid();
const count = z.int().min(0).max(1000);

/** Properties per event. Same allowlist as track_product_event in SQL. */
export const productEventSchemas = {
  recommendations_viewed: z.strictObject({
    recommendations: count,
    return_trips: count,
    units: count,
  }),
  recommendation_opened: z.strictObject({
    vehicle_id: uuid,
    rank: z.int().min(1).max(100),
    score: z.number().finite(),
    return_trip: z.boolean(),
  }),
  offer_submitted: z.strictObject({
    source: z.enum(['recommendation', 'search']),
    counter: z.boolean(),
  }),
} satisfies Record<ProductEventName, z.ZodType>;

export const PRODUCT_EVENT_NAMES = Object.keys(productEventSchemas) as ProductEventName[];

export type ProductEventProperties<N extends ProductEventName> = z.infer<
  (typeof productEventSchemas)[N]
>;

export type ProductEvent = {
  [N in ProductEventName]: {
    name: N;
    /** The load the event is about, if any. */
    loadId?: string | undefined;
    properties: ProductEventProperties<N>;
  };
}[ProductEventName];

/** The arguments of track_product_event, or null when the event is invalid. */
export function productEventArgs(
  event: ProductEvent,
): { p_name: ProductEventName; p_load_id?: string; p_properties: Json } | null {
  const parsed = productEventSchemas[event.name].safeParse(event.properties);
  if (!parsed.success) return null;
  if (event.loadId !== undefined && !uuid.safeParse(event.loadId).success) return null;
  return {
    p_name: event.name,
    ...(event.loadId ? { p_load_id: event.loadId } : {}),
    p_properties: parsed.data as Json,
  };
}
