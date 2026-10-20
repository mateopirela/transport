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
| `jorge.villarreal@demo.test` | Gerente                   | Transportes Regios del Norte (Monterrey)   | Ve y opera las 2 unidades de negocio (app y web); su caja seca descarga en GDL |
| `andrea.cavazos@demo.test`   | Coordinadora              | TRN · "Corredor MTY–GDL"                   | `TRN-01`, `CS53-01`, Pedro López, el viaje en descarga y su chat (app y web)   |
| `hector.ibarra@demo.test`    | Coordinador               | TRN · "Regional Monterrey"                 | `RF53-01`, `TT-01`, Raúl y Arturo; no ve nada del corredor (app y web)          |
| `carmen.navarro@demo.test`   | Gerente                   | Fletes Tapatíos (Guadalajara)              | Contraoferta por responder; plataforma con póliza en revisión      |
| `jose.sanchez@demo.test`     | Gerente y operador        | José Sánchez Medina (hombre-camión, D13)   | Oferta pendiente; viaje cerrado que manejó él mismo; en la app, "Mi viaje" |
| `pedro.lopez@demo.test`      | Operador                  | Transportes Regios del Norte               | Viaje en descarga: actualizar el fin estimado y terminar; "Reportar al coordinador" (chat interno, H1), también del viaje cancelado GDL → MTY (`transport://chat/5eed0008-0000-4000-8000-000000000005`) |
| `raul.mendez@demo.test`      | Operador                  | Transportes Regios del Norte               | Operador sin viaje activo                                          |
| `miguel.hernandez@demo.test` | Operador                  | Fletes Tapatíos                            | Viaje asignado Apodaca → GDL: registrar la salida                  |
| `81 1000 0013` (teléfono)    | Operador sin correo (G2)  | TRN · "Regional Monterrey"                 | Iván Garza: entra con su teléfono y `Demo1234` ("Correo o teléfono"); licencia aprobada, se le puede asignar `RF53-01` |

Arturo Cantú y Daniel Ortiz son operadores **sin cuenta** (para probar la invitación, D15).

Enlaces de invitación demo de TRN (G2, token fijo, **solo local** y de un solo uso: `supabase db reset` los renueva):

- Coordinador: `/invitacion/demo-coordinador-trn-0000000000000000000000` (web) o `transport://invitacion/demo-coordinador-trn-0000000000000000000000` (app).
- Operador por teléfono: `/invitacion/demo-operador-trn-0000000000000000000000000` (web) o `transport://invitacion/demo-operador-trn-0000000000000000000000000` (app; lo usa el flujo de Maestro `08-operator-invite.yaml`).

## Qué hay

- **6 empresas aprobadas** (3 clientes y 3 transportistas) con todos sus documentos aprobados, salvo la póliza de la plataforma de Fletes Tapatíos, que espera revisión: esa unidad no está lista para matching hasta que el admin la apruebe.
- **8 unidades** (tractocamiones, cajas secas, refrigerada, plataforma, tortons y rabón) y **7 operadores** (Iván Garza, solo con teléfono), con disponibilidad en Monterrey, Saltillo y Guadalajara, y rutas habituales MTY ↔ GDL.
- **15 cargas** en ambos sentidos y en todos los estados: 6 publicadas, 2 en negociación, 1 borrador, 1 contratada, 1 en curso, 2 completadas, 1 cancelada (contratada por Transportes Regios y cancelada por el cliente antes de salir) y 1 expirada.
- **5 viajes**: uno MTY → GDL **en descarga** con fin estimado en 2 horas (con línea de tiempo, puntos GPS del corredor, chat con el cliente y chat interno de Pedro con Andrea), uno asignado, dos cerrados y uno GDL → MTY **cancelado** con su chat interno abierto (H1, D20-E1).

### Recorrido por perfil (G9)

Con la seed recién cargada, cada perfil tiene algo que ver en la web y en la app (las pruebas de punta a punta recorren lo mismo: `e2e/tests/profiles.spec.ts` y los flujos de Maestro de la tabla de abajo):

| Perfil | Usuario | Web | App |
| --- | --- | --- | --- |
| Cliente | `ana.garza@demo.test` | Su viaje MTY → GDL en descarga: mapa, documentos del transportista (G6), alta de proveedor y "Compartir" seguimiento (G7) | — (los clientes usan la web) |
| Gerente | `jorge.villarreal@demo.test` | "Supervisión" por unidad de negocio en el inicio, toda la flota y "Mi empresa" (G4) | Viaje de regreso, asignar y "Más → Mi empresa" |
| Coordinador | `andrea.cavazos@demo.test`, `hector.ibarra@demo.test` | Solo su unidad de negocio: Andrea no ve `RF53-01` ni a Raúl; Héctor no abre el viaje del corredor | Andrea: solo `TRN-01` y `CS53-01`, sin "Mi empresa"; Héctor: liberar una unidad (G5) |
| Operador | `pedro.lopez@demo.test`, `miguel.hernandez@demo.test`, `81 1000 0013` | — (los operadores usan la app) | Estados, fotos, incidencia sin conexión; Iván entra con su teléfono y ve el aviso de ubicación precisa (D17) |
| Hombre-camión | `jose.sanchez@demo.test` | Su empresa, `JSM-01` y él mismo como operador | Oferta con `JSM-01`, se asigna y opera su viaje en "Mi viaje" |
| Anónimo | (sin cuenta) | Un enlace público de seguimiento sin precio ni direcciones; revocado, "ya no está disponible" | — |

**Ubicación precisa (D17):** la app del operador (y "Mi viaje" del hombre-camión) muestra el aviso «Ubicación precisa y "Siempre"» con el botón "Abrir ajustes" mientras el permiso no sea "Siempre" o la ubicación sea aproximada. Para verlo en el simulador, da solo "Mientras se usa la app" (el flujo `12-operator-phone.yaml` lo hace).

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

## Puertos alternos

Los ejemplos de esta página usan los puertos por defecto (API en `54321`, web en `3000`). Si están ocupados, corre todo en otros puertos sin editar `supabase/config.toml`:

```sh
eval "$(sh scripts/local-ports.sh 563)"   # en cada terminal que uses
supabase start                            # API en 56321, Studio en 56323, Mailpit en 56324
supabase status -o env                    # anon key; las URL ya reflejan los puertos nuevos
pnpm --filter @transport/web dev          # web en http://127.0.0.1:3020
```

El script solo imprime `export` de variables: `SUPABASE_*_PORT` (que Supabase CLI aplica sobre `config.toml`), la URL de Auth (`SUPABASE_AUTH_SITE_URL` y las redirecciones permitidas, para que los enlaces de los correos apunten a la web en su puerto), `PORT` y `NEXT_PUBLIC_*` para la web, y `E2E_BASE_URL` / `E2E_MAILPIT_URL` para Playwright. Corre `supabase stop` en una terminal con las mismas variables. En los comandos de arriba, cambia `54321` por el puerto de la API (p. ej. `56321`); la URL del despachador en Vault también (`http://host.docker.internal:56321/...`).

## Limitaciones

- **Archivos:** los documentos y la evidencia no tienen archivo en Storage (solo metadatos). El visor de documentos del admin no puede abrirlos.
- **Notificaciones:** las que generan los triggers se marcan como ya enviadas, para que el despachador (B09) no mande push ni correos con datos demo.

## Tests

- `supabase test db supabase/seed-tests` verifica el seed (corre justo después de `supabase db reset`).
- La suite pgTAP (`supabase test db`) crea sus propios datos y acota sus comprobaciones a ellos: pasa tanto sobre la base con seed como sobre una vacía (`supabase db reset --no-seed`). CI corre las tres cosas.
- Web de punta a punta: Playwright (`e2e/`) recorre los cinco perfiles y los escenarios de §G ([e2e/README.md](../e2e/README.md)).
- App móvil de punta a punta: `pnpm e2e:mobile` recorre en el simulador, sobre esta seed, al Gerente (Jorge: viaje de regreso, oferta, asignación y "Mi empresa"; Carmen: contraoferta), a los Coordinadores (Héctor libera una unidad; Andrea solo ve su unidad de negocio), a los operadores (Miguel: recolección, incidencia con foto sin conexión y entrega; Pedro: fin estimado y fin de descarga; un operador nuevo se da de alta por enlace con su teléfono; Iván entra con su teléfono) y al hombre-camión (José oferta, se asigna y sale en "Mi viaje"). Requisitos y cómo correrlo: [apps/mobile/.maestro/README.md](../apps/mobile/.maestro/README.md). No corre en CI.
