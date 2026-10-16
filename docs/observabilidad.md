# Observabilidad y analítica (B25)

## Errores: Sentry

- **Dónde:** web (navegador, servidor y edge), app móvil y Edge Functions.
- **Opcional:** sin DSN válido (`NEXT_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`) Sentry no se inicializa y todo funciona igual. Variables en [.env.example](../.env.example).
- **Privacidad (LFPDPPP):** `sendDefaultPii` está apagado y cada evento pasa por `scrubEvent` (`packages/shared/src/observability/sentry.ts`): del usuario solo viajan `id` y `role`; se quitan cookies, headers, query strings, correos, teléfonos, RFC, coordenadas y tokens. No hay session replay.
- **Pantallas de error:** `apps/web/src/app/error.tsx` y `global-error.tsx` en la web; `ErrorBoundary` de `apps/mobile/src/app/_layout.tsx` en la app. Muestran un mensaje en español (`errorBoundaryCopy`) y nunca el error crudo; la web muestra el `digest` como referencia para soporte.
- **Source maps:** solo se suben si el build tiene `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` y `SENTRY_PROJECT` (B27).

## Logs estructurados (Edge Functions)

Cada función se envuelve con `observe()` (`supabase/functions/_shared/observability.ts`):

- Una línea JSON por evento: `level`, `ts`, `service`, `msg`, `requestId` y el contexto, ya redactado.
- `x-request-id`: se respeta el del cliente si es un token simple; si no, se genera uno. Se devuelve en la respuesta.
- Una excepción no controlada se registra, se reporta a Sentry y se responde con `500 { error: 'internal_error', requestId }`.
- `LOG_LEVEL` (`debug | info | warn | error`, por defecto `info`).

En Supabase: _Edge Functions → Logs_, filtrando por `requestId` o `service`.

## Eventos de producto

Los KPIs del piloto que el dominio ya registra (cargas, ofertas, contratación, viajes de regreso, km en vacío) salen de las vistas `kpi_*` (B16). La tabla `product_events` cubre lo que el dominio no guarda: el embudo de recomendaciones.

| Evento                   | Cuándo (app del transportista)          | Propiedades                                      |
| ------------------------ | --------------------------------------- | ------------------------------------------------ |
| `recommendations_viewed` | se carga el inicio con recomendaciones  | `recommendations`, `return_trips`, `units`       |
| `recommendation_opened`  | abre una carga recomendada              | `vehicle_id`, `rank`, `score`, `return_trip`     |
| `offer_submitted`        | envía una oferta o contraoferta         | `source` (`recommendation`/`search`), `counter`  |

- Solo se escriben con la RPC `track_product_event`: el usuario, su rol y su empresa salen del JWT; las propiedades son una lista blanca de valores simples (sin datos personales). Más de 60 eventos por usuario y minuto se descartan sin error.
- Son inmutables y solo los lee el Admin. Ejemplo: cargas contratadas por un transportista que antes abrió la recomendación.

```sql
select e.load_id, e.properties ->> 'return_trip' as return_trip, l.contracted_at
from public.product_events e
join public.loads l on l.id = e.load_id
join public.negotiations n on n.load_id = l.id and n.carrier_company_id = e.company_id
join public.offers o on o.negotiation_id = n.id and o.status = 'accepted'
where e.name = 'recommendation_opened' and l.contracted_at is not null;
```
