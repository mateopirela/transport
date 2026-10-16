# Demo local: datos semilla MTY ↔ GDL

`supabase db reset` (y el primer `supabase start`) aplica las migraciones y carga [supabase/seed.sql](../supabase/seed.sql): un entorno navegable del piloto Monterrey ↔ Guadalajara. Las fechas se calculan a partir de la hora del reset, así que la demo siempre se ve "de hoy".

> **Solo para entorno local.** Todos los usuarios demo comparten una contraseña publicada aquí. Nunca cargues este seed en staging ni en producción.

## Usuarios

Contraseña de todos: **`Demo1234`**

| Correo                       | Perfil                    | Empresa                                    | Para probar                                                        |
| ---------------------------- | ------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `admin@demo.test`            | Admin                     | —                                          | Cola de verificación (1 documento pendiente), todas las cargas     |
| `ana.garza@demo.test`        | Cliente                   | Aceros del Norte (Monterrey)               | Viaje en descarga en GDL con mapa y chat; oferta pendiente         |
| `luis.ramirez@demo.test`     | Cliente                   | Alimentos de Occidente (Guadalajara)       | Carga GDL → MTY publicada; contraoferta esperando al transportista |
| `sofia.trevino@demo.test`    | Cliente                   | Empaques Plásticos Regios (Monterrey)      | Borrador, carga contratada con viaje asignado, carga expirada      |
| `jorge.villarreal@demo.test` | Transportista             | Transportes Regios del Norte (Monterrey)   | Flota de 4 unidades; su caja seca termina de descargar en GDL      |
| `carmen.navarro@demo.test`   | Transportista             | Fletes Tapatíos (Guadalajara)              | Contraoferta por responder; plataforma con póliza en revisión      |
| `jose.sanchez@demo.test`     | Transportista y operador  | José Sánchez Medina (hombre-camión, D13)   | Oferta pendiente; viaje cerrado que manejó él mismo                |
| `pedro.lopez@demo.test`      | Operador                  | Transportes Regios del Norte               | Viaje en descarga: actualizar el fin estimado y terminar           |
| `raul.mendez@demo.test`      | Operador                  | Transportes Regios del Norte               | Operador sin viaje activo                                          |
| `miguel.hernandez@demo.test` | Operador                  | Fletes Tapatíos                            | Viaje asignado Apodaca → GDL: registrar la salida                  |

Arturo Cantú y Daniel Ortiz son operadores **sin cuenta** (para probar la invitación, D15).

## Qué hay

- **6 empresas aprobadas** (3 clientes y 3 transportistas) con todos sus documentos aprobados, salvo la póliza de la plataforma de Fletes Tapatíos, que espera revisión: esa unidad no está lista para matching hasta que el admin la apruebe.
- **8 unidades** (tractocamiones, cajas secas, refrigerada, plataforma, tortons y rabón) y **6 operadores**, con disponibilidad en Monterrey, Saltillo y Guadalajara, y rutas habituales MTY ↔ GDL.
- **15 cargas** en ambos sentidos y en todos los estados: 6 publicadas, 2 en negociación, 1 borrador, 1 contratada, 1 en curso, 2 completadas, 1 cancelada y 1 expirada.
- **4 viajes**: uno MTY → GDL **en descarga** con fin estimado en 2 horas (con línea de tiempo, puntos GPS del corredor y chat), uno asignado y dos cerrados.

### Escenario del viaje de regreso (B08)

La caja seca `CS53-01` de Transportes Regios está descargando en Guadalajara. Su disponibilidad se toma del fin estimado de descarga (`estimated_unload_end_at`) y queda en Guadalajara. La carga compatible más cercana es **GDL → MTY** de Alimentos de Occidente: con este seed, debe ser su primera recomendación.

Para probarlo: `supabase functions serve` y, con la sesión de `jorge.villarreal@demo.test`, `POST /functions/v1/recommendations` con `{"vehicleId": "5eed0004-0000-4000-8000-000000000002"}`. Sin `GOOGLE_ROUTES_API_KEY` (en `supabase/functions/.env`) las distancias son estimadas (haversine × `ROAD_DISTANCE_FACTOR`); con clave, solo el top N consulta Routes y el resultado queda en `route_distance_cache`.

### Notificaciones y crons (B09)

`pg_cron` corre estos trabajos (horario UTC; Ciudad de México es UTC−6):

| Trabajo                       | Cuándo           | Qué hace                                                                                   |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `dispatch-notifications`      | cada minuto      | Llama a la Edge Function `dispatch-notifications` si hay notificaciones pendientes         |
| `expire-stale-loads`          | cada 15 min      | Expira las cargas publicadas o en negociación cuya ventana de recolección ya pasó          |
| `process-document-expiry`     | 07:00 (CDMX)     | Marca como `expired` los documentos vencidos y avisa de los que vencen en 30 y 7 días      |
| `remind-stale-trip-locations` | cada 10 min      | Recuerda al operador de un viaje activo que lleva más de 3 horas sin enviar su ubicación   |

La función envía push (Expo) a todos los dispositivos del usuario y correo a los usuarios web (Cliente y Admin). Sin `EMAIL_PROVIDER_API_KEY` o `EMAIL_FROM`, el correo se simula (queda en el log, no se envía). Para probarla en local:

```sh
# supabase/functions/.env: NOTIFICATIONS_DISPATCH_SECRET=<un secreto local> (y, si quieres, las claves de correo)
supabase functions serve
curl -X POST -H "x-dispatch-secret: <el mismo secreto>" http://127.0.0.1:54321/functions/v1/dispatch-notifications
```

Para que el cron la invoque, guarda la URL y el secreto en Vault (en staging/prod, con la URL del proyecto):

```sql
select vault.create_secret('http://host.docker.internal:54321/functions/v1/dispatch-notifications', 'notifications_dispatch_url');
select vault.create_secret('<el mismo secreto>', 'notifications_dispatch_secret');
```

Sin esos dos secretos el trabajo `dispatch-notifications` no hace nada (las notificaciones siguen en la bandeja de la app).

## Limitaciones

- **Archivos:** los documentos y la evidencia no tienen archivo en Storage (solo metadatos). El visor de documentos del admin no puede abrirlos.
- **Notificaciones:** las que generan los triggers se marcan como ya enviadas, para que el despachador (B09) no mande push ni correos con datos demo.

## Tests

- `supabase test db supabase/seed-tests` verifica el seed (corre justo después de `supabase db reset`).
- La suite pgTAP (`supabase test db`) crea sus propios datos y acota sus comprobaciones a ellos: pasa tanto sobre la base con seed como sobre una vacía (`supabase db reset --no-seed`). CI corre las tres cosas.
