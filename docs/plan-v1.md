# Plan de implementación: V1

> Qué construimos: [producto-v1.md](producto-v1.md). Por qué lo hacemos así: [decisiones.md](decisiones.md).
> Este plan lo va a ejecutar un **workflow dinámico de agentes**. Cada **bloque es un PR** que revisan CI y Greptile antes del merge.

---

## 0. Cómo se ejecuta este plan

### 0.1 Ciclo de vida de cada bloque

```
plan (este doc) ─▶ rama v1/<id>-<slug> ─▶ implementación + tests ─▶ checks locales
     ─▶ push + PR (plantilla) ─▶ CI verde ─▶ revisión de Greptile
          ├─ aprobado ─────────────────────────────────▶ merge a main ─▶ desbloquea los dependientes
          └─ no aprobado ─▶ corregir ─▶ push ─▶ revisión de Greptile de nuevo (se repite el ciclo)
```

- **Rama:** `v1/B07-chat-schema`. **Título del PR:** `[B07] Chat y notificaciones: esquema`.
- **Tamaño objetivo:** menos de ~800 líneas cambiadas por PR, sin contar archivos generados ni lockfiles. Si un bloque crece de más, se divide en `B07a`/`B07b`.
- **Un bloque solo toca su alcance.** Si encuentra algo fuera de alcance, lo anota en la sección "Seguimiento" del PR y no lo arregla ahí.
- **Revisión de Greptile:** la hace la app de GitHub sobre el PR (Greptile está activado en el repo). El CLI (`greptile review`) sirve para revisar la rama antes de abrir el PR y llegar más limpio. El agente responde **cada** comentario: lo corrige o explica en el hilo por qué no aplica.
- **Gate de merge (D14):** **Greptile decide.**
  - Si Greptile **aprueba**, se hace merge (squash) a `main` y se borra la rama.
  - Si Greptile **no aprueba**, el agente corrige, hace push y pide una nueva revisión (comentario `@greptileai review`). El ciclo se repite hasta que apruebe.
  - "Aprobado" significa que la revisión más reciente de Greptile no deja comentarios sin resolver y su puntuación de confianza es de 4/5 o más.
  - Si después de **5 rondas** sigue sin aprobar, o si el agente y Greptile no se ponen de acuerdo en un hallazgo, el PR se detiene y se escala a Mateo, sin hacer merge.
  - CI en verde es requisito previo: no se pide revisión con CI en rojo.
- **Bloques 🔒:** tienen **revisión reforzada**. Se pide a Greptile con instrucciones extra de seguridad (`--instructions` / `@greptileai` con foco en RLS, concurrencia y privacidad) y el agente corre también `/security-review` antes de abrir el PR. El gate sigue siendo Greptile.

### 0.2 Olas y paralelismo

Los bloques se agrupan en **olas**. Los de una misma ola son independientes y se trabajan en paralelo, cada uno en su propio git worktree. Una ola empieza cuando sus dependencias ya están en `main`. Cada ola es una ejecución del workflow, de 3 a 7 agentes.

```
Ola 0  B00 ──▶ B01 ─┬─▶ B02
                    │
Ola 1               ├─▶ B03   B04 ──▶ B05 ──▶ B06 ─┬─▶ B07
                    │                              └─▶ B10 (seed)
Ola 2               └──────────────▶ B08 (matching)   B09 (notificaciones)
                                                   │
Ola 3 (web)     B11 ─▶ B12 · B13 ─▶ B14 ─▶ B15 · B16      ┐ en paralelo
Ola 4 (móvil)   B17 ─▶ B18 · B19 ─▶ B20 · B21 ─▶ B22 · B23 ┘
Ola 5           B24 · B25 · B26 ─▶ B27
```

Las pistas web (Ola 3) y móvil (Ola 4) corren **en paralelo** cuando las Olas 1 y 2 ya están en `main`. B11 y B17 (los esqueletos de las apps) pueden empezar desde que B01 está en `main`.

### 0.3 Definición de terminado (aplica a todos los PR)

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde, local y en CI.
- [ ] Cada tabla nueva tiene **RLS activada** y **tests pgTAP** de la matriz rol × operación: quién puede leer, insertar, actualizar y borrar.
- [ ] Cada transición de estado se hace por una **función RPC** que valida la transición, nunca con un `update` libre desde el cliente.
- [ ] La lógica pura tiene tests unitarios (Vitest).
- [ ] Los PR de UI incluyen capturas o un video corto y todos los textos en español.
- [ ] Los tipos de BD están regenerados (`pnpm db:types`) si cambió el esquema.
- [ ] No se agregan secretos al repo. Las variables nuevas se documentan en `.env.example`.
- [ ] La descripción del PR usa la plantilla: qué, por qué, cómo probar, capturas, riesgos y seguimiento.
- [ ] Greptile aprueba el PR (D14).

### 0.4 Convenciones

- **Idioma:** el código, los identificadores y los nombres de BD van en **inglés**. Los textos de UI y la documentación de producto, en **español**. Los commits van en inglés e imperativo (`Add trip events table`).
- **Textos de UI:** centralizados en `packages/shared/src/copy/` y no regados en componentes. Solo hay español (D02), pero así se corrigen en un solo lugar.
- **Dinero:** se guarda en centavos MXN (`bigint`) y se formatea con `Intl.NumberFormat('es-MX', { currency: 'MXN' })`.
- **Fechas:** `timestamptz` en BD; se muestran en `America/Mexico_City`.
- **Geografía:** PostGIS `geography(Point, 4326)`, más ciudad y estado en texto para filtros rápidos.
- **IDs:** `uuid` (`gen_random_uuid()`).
- **Borrado:** borrado lógico (`archived_at`) en entidades de negocio. Mensajes, eventos de viaje y bitácora de auditoría son **inmutables**.

---

## 1. Arquitectura

```
transport/
├─ apps/
│  ├─ web/          Next.js (App Router) + Tailwind + shadcn/ui  → Cliente, Admin, Gerente y Coordinador (D06-E1)
│  └─ mobile/       Expo (Expo Router, dev build con EAS)        → Gerente, Coordinador y Operador
├─ packages/
│  └─ shared/       Tipos de BD generados, enums + etiquetas en español, esquemas zod,
│                   máquinas de estado, scoring de matching, formateadores, copy
├─ supabase/
│  ├─ migrations/   SQL versionado
│  ├─ functions/    Edge Functions (Deno): recomendaciones, notificaciones, crons
│  ├─ tests/        pgTAP
│  └─ seed.sql      datos demo MTY ↔ GDL
├─ docs/
└─ .github/         CI, plantilla de PR
```

**Servicios externos:**
- Supabase: local con Docker para desarrollo; proyectos `staging` y `prod` en la nube.
- Google Maps Platform: Places Autocomplete, Maps JS, Maps SDK iOS/Android y Routes API para distancias y ETA.
- Expo/EAS: builds y push notifications.
- Vercel: hosting de la web.
- Email transaccional: SMTP propio en Supabase Auth y avisos (Resend o similar).
- Sentry: errores.
- Greptile: revisión de código.

**Seguridad:**
- Toda autorización vive en Postgres (RLS y funciones `security definer` con validación explícita).
- Las apps solo usan la *anon key* y el JWT del usuario.
- La *service role* solo existe en Edge Functions y CI.

### 1.1 Modelo de datos (resumen)

| Módulo | Tablas |
|---|---|
| Identidad | `companies` (type: `shipper`/`carrier`, rfc, status), `profiles` (1:1 con `auth.users`, role, company_id) |
| Verificación | `document_requirements` (catálogo, D12), `documents` (owner polimórfico: company/vehicle/operator; status, expires_at), `audit_log` |
| Flota | `vehicles` (kind: tractor/rigid/trailer, unit_type, capacity_kg, capacity_m3, features), `operators` (licencia, tipo, vigencia), `operator_invitations`, `carrier_routes`, `vehicle_availability` (dónde y desde cuándo) |
| Cargas | `loads` (origen y destino geo, ventanas, mercancía, peso, unit_type, requisitos, precio propuesto, status) |
| Negociación | `negotiations` (load × carrier), `offers` (side: shipper/carrier, monto, condiciones, status; cadena de contraofertas) |
| Viajes | `trips`, `trip_events` (tipo, occurred_at, ubicación, **estimated_unload_end_at**), `trip_locations` (alto volumen), `trip_evidence` (fotos + metadatos), `incidents` |
| Comunicación | `conversations` (por negociación o viaje), `messages` (inmutables), `message_reads`, `push_tokens`, `notifications` |
| Mapas | `route_distance_cache` (origen/destino redondeados → km, minutos) |
| §G (2026-10-16) | `business_units`, `business_unit_coordinators`, `invitations`, `vehicle_release_tasks`, `trip_document_requirements`, `license_unit_compatibility`, `document_shares`, `document_share_views`, `provider_approvals`, `share_links` (y, cuando se retome G8, pospuesto por D24: `subscription_plans`, `company_subscriptions` y `billing_events`). Roles: `user_role` pasa a `shipper`/`manager`/`coordinator`/`operator`/`admin` (ver §G) |
| §H (2026-10-20) | Conversación `trip_internal` (sin tabla nueva), `share_links` de tipo `trip_operator`, `platform_settings`, `subscription_plans`, `company_subscriptions`, `billing_events`, `road_segments`, `road_segment_tolls`, `road_segment_risks`, `road_corridors`, `road_corridor_segments`, `carrier_road_preferences` y `trip_stop_dwells` (ver §H) |

**Máquinas de estado** (código en `packages/shared`, validación en SQL):
- `loads`: `draft → published → negotiating → contracted → in_progress → completed`. Desde los primeros estados también puede ir a `cancelled` o `expired`.
- `offers`: `pending → accepted | rejected | countered | withdrawn | expired`.
- `trips`: `pending_assignment → assigned → en_route_to_pickup → at_pickup → loading → in_transit → at_delivery → unloading → delivered → closed`. También existe `cancelled`, con motivo.
- `documents` y `companies`: `pending_review → approved | rejected`, y después `expired` o `suspended`.

---

## 2. Bloques

Formato de cada bloque: **objetivo · depende de · alcance · fuera de alcance · criterios de aceptación · notas para la revisión**.

---

### OLA 0: Fundamentos

#### B00 · Monorepo, tooling y CI 🔒
- **Depende de:** nada.
- **Alcance:**
  - pnpm workspaces y Turborepo; TypeScript estricto con `tsconfig` base.
  - ESLint, Prettier y Vitest; Node fijado con `.nvmrc`.
  - `packages/shared` vacío y compilando.
  - GitHub Actions: `lint`, `typecheck` y `test` en cada PR, con caché de pnpm.
  - `.github/pull_request_template.md`, `CONTRIBUTING.md` (convenciones de §0.4) y `.env.example`.
  - `CLAUDE.md` con instrucciones para los agentes: leer el plan, respetar el alcance y la definición de terminado.
  - Configuración de Greptile en el repo, con reglas de revisión: RLS obligatoria, transiciones por RPC, textos en español, sin secretos.
- **Fuera de alcance:** apps y BD.
- **Aceptación:** `pnpm i && pnpm lint && pnpm typecheck && pnpm test` pasan en limpio. CI corre en un PR de prueba. Greptile comenta en el PR.
- **Revisión:** que la configuración no sea excesiva y que el caché de CI funcione.

#### B01 · Supabase base: identidad y RLS 🔒
- **Depende de:** B00.
- **Alcance:**
  - `supabase init`; extensiones `postgis`, `pgcrypto` y `pg_cron`.
  - Enums: `company_type`, `user_role` (`shipper`, `carrier`, `operator`, `admin`), `verification_status`.
  - Tablas `companies` y `profiles`. Trigger `on_auth_user_created` que crea el perfil desde `raw_user_meta_data`.
  - Helpers SQL `auth_role()`, `auth_company_id()`, `is_admin()` y `is_company_approved()`, en `security definer` con `search_path` fijo.
  - Políticas RLS: cada quien ve su empresa y perfil; el admin ve todo. Nadie puede cambiarse su propio `role`, `status` ni `company_id`.
  - pgTAP configurado, con la matriz de tests de estas tablas.
  - Script `pnpm db:types`, que genera tipos en `packages/shared/src/db.ts`.
  - Job de CI que levanta Supabase y corre `supabase test db`.
- **Aceptación:** las migraciones aplican desde cero; los tests pgTAP pasan en CI; un usuario no puede escalar privilegios (hay un test que lo prueba).
- **Revisión:** que no haya funciones `security definer` sin `search_path`; que las políticas no tengan recursión.

#### B02 · Paquete compartido: dominio
- **Depende de:** B00. Puede ir en paralelo con B01 y se ajusta a los tipos generados cuando B01 entra a `main`.
- **Alcance:**
  - Enums y **catálogos en español**: tipos de unidad (caja seca, refrigerada, plataforma, lowboy, tolva, pipa/tanque, portacontenedor, jaula, redilas, torton, rabón, camioneta 3.5 t), tipos de carga y requisitos especiales.
  - Máquinas de estado puras: `canTransition(entity, from, to, actor)`.
  - Esquemas zod de formularios: carga, oferta, vehículo, empresa con validación de RFC (persona moral 12 caracteres, física 13) y operador.
  - Formateadores: MXN, fechas y horas en CDMX, distancias.
  - Estructura de `copy/`.
- **Aceptación:** más del 90 % de cobertura en máquinas de estado y validadores; tests de RFC válidos e inválidos.

---

### OLA 1: Esquema de dominio (con RLS y pgTAP en cada uno)

#### B03 · Verificación y documentos 🔒
- **Depende de:** B01.
- **Alcance:**
  - `document_requirements`, sembrado con una **lista provisional**: constancia de situación fiscal, acta constitutiva, identificación del representante, comprobante de domicilio; permiso SCT/SICT y póliza de seguro para transportistas; tarjeta de circulación y póliza por unidad; licencia federal por operador. JP la reemplaza después (D16).
  - `documents` y bucket de Storage privado `documents/` con rutas `{company_id}/{owner_type}/{owner_id}/{uuid}`.
  - Políticas de Storage alineadas con RLS.
  - RPCs: `submit_document`, `review_document(approve|reject, notes)` (solo admin), `review_company`.
  - Una empresa queda `approved` solo si el admin la aprueba y tiene completos los documentos requeridos.
  - `audit_log`, llenado por trigger en las acciones del admin.
- **Aceptación:** una empresa no puede leer documentos de otra; los rechazos guardan el motivo; la auditoría registra quién aprobó qué.

#### B04 · Flota
- **Depende de:** B01.
- **Alcance:**
  - `vehicles`, `operators`, `operator_invitations` (código o enlace de un solo uso con expiración, ligado al email del operador; D15: el operador crea su contraseña al aceptar), `carrier_routes` y `vehicle_availability`.
  - RPC `accept_operator_invitation`.
  - Un transportista solo administra su flota. Un operador ve su propio perfil y la unidad que tiene asignada.
  - Caso "hombre-camión" (D13): un usuario `carrier` puede tener también un registro de operador.
- **Aceptación:** tests de aislamiento entre empresas; una invitación vencida o ya usada falla.

#### B05 · Cargas y negociación 🔒
- **Depende de:** B04 (las ofertas pueden proponer una unidad).
- **Alcance:**
  - `loads`, `negotiations` y `offers`.
  - RPCs transaccionales: `publish_load`, `update_load`, `cancel_load`, `make_offer`, `counter_offer`, `reject_offer`, `withdraw_offer`, y `accept_offer`. Esta última es **atómica**: acepta la oferta, rechaza las demás pendientes de la carga, pasa la carga a `contracted` y **crea el viaje**. Por eso deja un hueco para B06: la creación del viaje se implementa en B06 y aquí se deja preparada con un stub y un test pendiente, o bien B05 y B06 van en un mismo PR si el tamaño lo permite.
  - Solo empresas `approved` pueden publicar u ofertar.
  - Las cargas `published` son visibles para todos los transportistas aprobados. Las negociaciones solo las ven sus dos partes.
- **Aceptación:** no puede haber dos ofertas aceptadas para una carga (con `unique` parcial y un test de concurrencia); las transiciones inválidas fallan con error claro.
- **Revisión:** condiciones de carrera en `accept_offer`.

#### B06 · Viajes, eventos, ubicación y evidencia 🔒
- **Depende de:** B05.
- **Alcance:**
  - `trips`, `trip_events`, `trip_locations` (índice por `trip_id, recorded_at`; inserción en lote por RPC), `trip_evidence` (bucket `evidence/` con metadatos: etapa, hora de captura, ubicación y hash del archivo) e `incidents`.
  - RPCs: `assign_trip` (unidad y operador del transportista), `record_trip_event` (valida la transición y guarda `occurred_at` y la ubicación), `set_estimated_unload_end`, `confirm_delivery` (cliente), `report_incident` y `resolve_incident`.
  - Completar la creación del viaje en `accept_offer`.
  - Cada `trip_event` puede actualizar `vehicle_availability`: al estimar el fin de descarga, la unidad queda "disponible desde X en la ciudad destino". **Esto alimenta el modo viaje de regreso.**
- **Aceptación:**
  - Solo el operador asignado registra ubicación y eventos de su viaje.
  - El cliente ve la ubicación de su viaje **solo mientras está activo**.
  - La línea de tiempo es inmutable.

#### B07 · Chat y notificaciones (esquema)
- **Depende de:** B05 y B06.
- **Alcance:**
  - `conversations`: una por negociación y otra por viaje (cliente ↔ transportista; el operador puede participar en la del viaje).
  - `messages`: inmutables, con texto y adjuntos en Storage. `message_reads`.
  - Publicación Realtime para `messages`.
  - `push_tokens` y `notifications` (bandeja dentro de la app).
  - Triggers que insertan en `notifications` ante los eventos clave (§3 de producto).
- **Aceptación:** solo los participantes leen y escriben; no se pueden editar ni borrar mensajes (hay test).

#### B10 · Datos semilla MTY ↔ GDL
- **Depende de:** B06 (y B07 si existe).
- **Alcance:** `seed.sql` con:
  - un admin, 3 clientes y 3 transportistas (uno de ellos "hombre-camión")
  - 8 unidades de varios tipos y 6 operadores
  - 15 cargas en ambos sentidos, en varios estados
  - un viaje MTY → GDL en descarga con fin estimado, para probar los viajes de regreso
  - usuarios demo con contraseñas documentadas **solo para entorno local**
- **Aceptación:** `supabase db reset` deja un entorno navegable para la demo.

---

### OLA 2: Lógica de backend

#### B08 · Motor de matching V1 (reglas) 🔒
- **Depende de:** B06 y B10.
- **Alcance:**
  - **RPC SQL `match_candidates(vehicle_id | availability_id)`**: filtra cargas `published` por compatibilidad de `unit_type`, capacidad (kg y m³), requisitos especiales, traslape entre la ventana de recolección y la disponibilidad, y un radio máximo de km en vacío (PostGIS `ST_DWithin`; configurable, por defecto 150 km).
  - **Scoring en `packages/shared/matching`** (puro y con tests). Ingredientes:
    - km en vacío (pesa en contra)
    - horas muertas entre disponibilidad y recolección (pesa en contra)
    - precio por km total = precio / (km en vacío + km con carga) (pesa a favor)
    - coincidencia con rutas habituales (bonus)
    - modo regreso: el destino de la carga cerca de la base del transportista (bonus)
    - los pesos son configurables
  - **Edge Function `recommendations`**:
    - obtiene candidatos y calcula la distancia real con Google Routes **solo para el top N** (por defecto 10), usando `route_distance_cache`
    - calcula el score y devuelve una lista ordenada con un desglose explicable, por ejemplo: "45 km en vacío · $38/km · coincide con tu ruta MTY–GDL"
  - **Modo viaje de regreso:** para unidades con viaje activo, se usa como punto de partida el destino del viaje y como hora el `estimated_unload_end_at`.
  - **Recomendaciones inversas:** cuando se publica una carga, se calculan las unidades compatibles y se notifica a sus transportistas (aquí se encola; el envío lo hace B09).
- **Aceptación:**
  - Tests de scoring con fixtures reales MTY/GDL/Saltillo/León.
  - Con la seed, el camión en descarga en GDL recibe como primera recomendación la carga GDL → MTY.
  - El costo de Maps está acotado por el top N y la caché.
- **Revisión:** que el scoring se pueda explicar y ajustar; que no haya llamadas a Maps sin caché.

#### B09 · Servicio de notificaciones y crons
- **Depende de:** B07 (y B08 para la notificación de carga compatible).
- **Alcance:**
  - Edge Function `dispatch-notifications`: consume `notifications` pendientes, envía Expo Push a los tokens del usuario y email a usuarios web (plantillas en español). Hace reintentos y limpia tokens inválidos.
  - Crons con `pg_cron`:
    - expirar cargas cuya ventana de recolección ya pasó
    - avisar de documentos que vencen en 30 y 7 días y marcarlos como `expired`
    - recordar al operador si un viaje activo lleva más de X horas sin ubicación
- **Aceptación:** tests de la función con proveedores simulados; hay idempotencia (no se envía dos veces).

---

### OLA 3: Web (Cliente y Admin)

#### B11 · Esqueleto web y autenticación
- **Depende de:** B01 (puede adelantarse a las Olas 1 y 2).
- **Alcance:**
  - Next.js App Router, Tailwind, shadcn/ui y `@supabase/ssr`.
  - Login, registro de empresa cliente, recuperación de contraseña y verificación de email.
  - Layout por rol (cliente o admin) y middleware de rutas protegidas.
  - Pantalla "cuenta en revisión".
  - Tema visual base, alineado con el deck: azul marino, acento azul y tipografía serif en los títulos.
- **Aceptación:** un usuario no admin no entra a `/admin`; los formularios usan los esquemas zod de `shared`.

#### B12 · Onboarding del cliente y panel Admin de verificación
- **Depende de:** B11 y B03.
- **Alcance:**
  - Cliente: asistente de registro (datos de empresa, RFC y carga de documentos según `document_requirements`) con el estado de cada documento.
  - Admin: cola de verificación de empresas, documentos, unidades y operadores, con visor de documentos (URL firmada), aprobar o rechazar con motivo, lista de usuarios, suspender y reactivar, y vista de auditoría.
- **Aceptación:** el flujo completo funciona de punta a punta: registro → documentos → aprobación → el cliente ya puede publicar.

#### B13 · Cliente: publicar y gestionar cargas
- **Depende de:** B12 y B05.
- **Alcance:**
  - Formulario de carga como en el mockup del deck: origen y destino con Places Autocomplete, fechas y horarios, mercancía, peso, características, tipo de unidad y precio propuesto.
  - Lista de cargas por estado, detalle, edición y cancelación.
  - Vista previa de la ruta en el mapa.
- **Aceptación:** validaciones en cliente y servidor; los datos de Places quedan guardados (dirección, punto, ciudad y estado).

#### B14 · Cliente: ofertas, negociación y chat
- **Depende de:** B13 y B07.
- **Alcance:**
  - Bandeja de ofertas por carga con comparador: precio, transportista, unidad propuesta y estatus de verificación.
  - Contraofertar, aceptar con confirmación explícita y rechazar.
  - **Chat en tiempo real** por negociación, con adjuntos y leídos.
  - Bandeja de notificaciones.
- **Aceptación:** al aceptar una oferta se crea el viaje y las demás ofertas se cierran (lo refleja la UI en tiempo real).

#### B15 · Cliente: seguimiento de viajes
- **Depende de:** B14 y B06.
- **Alcance:**
  - Viajes activos e historial.
  - Detalle con mapa en vivo: última ubicación y trazo por Realtime o sondeo.
  - Línea de tiempo de eventos con el fin estimado de descarga.
  - Galería de evidencia, documentos del viaje (Carta Porte), confirmar entrega, reportar incidencia y chat del viaje.
- **Aceptación:** el mapa se actualiza solo mientras el viaje está activo; si la ubicación no llega, se muestra "sin señal desde HH:MM".

#### B16 · Admin: operación y estadísticas
- **Depende de:** B15.
- **Alcance:**
  - Supervisión de cargas y viajes con filtros.
  - Asignación manual: el admin crea u ofrece la contratación en nombre de las partes (queda en auditoría).
  - Gestión de incidencias.
  - Dashboard con los KPIs del piloto (§5 de producto).
- **Aceptación:** los KPIs se calculan con vistas SQL y tienen tests.

---

### OLA 4: Móvil (Transportista y Operador)

#### B17 · Esqueleto móvil y autenticación 🔒
- **Depende de:** B01 (puede adelantarse).
- **Alcance:**
  - Expo con Expo Router; `eas.json` con perfiles `development`, `preview` y `production`. Desde el inicio se usa **dev build**, porque la ubicación en segundo plano no corre en Expo Go.
  - Supabase con sesión guardada en `expo-secure-store`.
  - Login con email y contraseña, registro de transportista y "unirme con invitación" para operadores (abre el enlace, confirma email y crea contraseña; D15).
  - Navegación por rol (tabs del transportista como en el mockup del deck: Inicio, Unidades, Cargas, Viajes, Más; vista de operador).
  - Registro de push token. Manejo offline básico (banner sin conexión).
- **Aceptación:** builds de desarrollo para iOS y Android compilan; el login funciona contra Supabase local.

#### B18 · Transportista: onboarding y flota
- **Depende de:** B17, B03 y B04.
- **Alcance:**
  - Asistente de empresa con documentos (cámara o selector de archivos, compresión).
  - Unidades: alta, edición y documentos.
  - Operadores: invitar por enlace o código para compartir.
  - Rutas habituales y disponibilidad (ubicación y fecha).
- **Aceptación:** el alta completa desde el teléfono funciona; una unidad con documentos vencidos se marca como no disponible.

#### B19 · Transportista: cargas recomendadas y negociación
- **Depende de:** B18, B08 y B07.
- **Alcance:**
  - Inicio con "Cargas recomendadas" y el desglose del score.
  - Sección destacada de **"Viajes de regreso"** por cada unidad en viaje.
  - Búsqueda con filtros.
  - Detalle de carga con mapa y km en vacío.
  - Ofertar y contraofertar (Negociar, Aceptar el precio propuesto o Rechazar, como en el mockup), con chat.
- **Aceptación:** con la seed, el escenario de regreso GDL → MTY aparece arriba.

#### B20 · Transportista: viajes y asignación
- **Depende de:** B19 y B06.
- **Alcance:** viajes ganados con "Asignar operador" (unidad y operador), monitoreo de viajes activos en el mapa, historial y subir documentos del viaje (Carta Porte).
- **Aceptación:** al asignar, el operador recibe un push.

#### B21 · Operador: viaje y estados
- **Depende de:** B17 y B06.
- **Alcance:**
  - Pantalla "Viaje asignado" según el mockup: origen, destino e instrucciones.
  - Controles de estado en orden lógico, con confirmación.
  - Al iniciar la descarga, pedir el **fin estimado de descarga**, editable después.
  - Reportar incidencia y chat del viaje.
  - Los eventos se guardan offline y se sincronizan después.
- **Aceptación:** no se puede saltar estados inválidos; los eventos offline llegan con su `occurred_at` original.

#### B22 · Operador: GPS en segundo plano 🔒
- **Depende de:** B21.
- **Alcance:**
  - Pantalla de consentimiento (texto legal y explicación), que queda registrada.
  - `expo-location` y `expo-task-manager`: el seguimiento **solo** está activo en estados de viaje activos y se detiene solo al entregar.
  - Intervalo de ~60 s o 500 m, configurable.
  - Cola local en SQLite e inserción en lote vía RPC.
  - En Android, servicio en primer plano con notificación persistente. En iOS, `UIBackgroundModes: location` y la justificación de "Siempre" para la App Store.
  - Indicador en la UI de "compartiendo ubicación".
- **Aceptación:**
  - Probado en un dispositivo real de cada plataforma con la app cerrada.
  - Consumo de batería medido y documentado en el PR.
  - Funciona sin conexión y sincroniza después.
- **Revisión:** privacidad (no rastrear fuera de viajes) y cumplimiento de las políticas de las tiendas.

#### B23 · Operador: evidencia fotográfica
- **Depende de:** B21.
- **Alcance:**
  - Captura con cámara (no galería, para evitar fotos viejas) de recolección, entrega e incidencias, con hora, ubicación y hash.
  - Mínimo de fotos por etapa, configurable.
  - Cola de subida offline con reintentos.
  - Firma o nombre de quien recibe en la entrega.
- **Aceptación:** las fotos llegan con sus metadatos; no se puede marcar "entregado" sin la evidencia mínima. El resultado deja preparado el material para la futura IA de comparación.

---

### OLA 5: Endurecimiento y lanzamiento

#### B24 · Auditoría de seguridad y RLS 🔒
- **Depende de:** las Olas 3 y 4.
- **Alcance:**
  - Matriz pgTAP completa (rol × tabla × operación × "otra empresa").
  - Revisión de buckets de Storage y de todas las funciones `security definer`.
  - Límites de frecuencia en Edge Functions.
  - Revisión de dependencias.
  - Pasar el skill `security-review`.
- **Aceptación:** cero hallazgos altos abiertos.

#### B25 · Observabilidad y analítica
- **Alcance:**
  - Sentry en web, móvil y Edge Functions.
  - Eventos de producto para los KPIs.
  - Logs estructurados en funciones.
  - Error boundaries con mensajes en español.

#### B26 · Pruebas de punta a punta
- **Alcance:**
  - Playwright (web): registro → verificación → publicar → negociar → aceptar → seguir el viaje.
  - Maestro (móvil): login del transportista → ofertar → asignar; operador → estados → evidencia.
  - **Escenario estrella:** viaje MTY → GDL y la recomendación de regreso GDL → MTY se contrata antes de terminar la descarga.
- Se corren en CI contra Supabase local con la seed.

#### B27 · Entornos y release 🔒
- **Alcance:**
  - Proyectos Supabase `staging` y `prod`, con migraciones aplicadas por CI al hacer merge (staging) y en release manual (prod).
  - Vercel para la web.
  - EAS Build y Submit hacia TestFlight y Play (pruebas internas).
  - Aviso de privacidad (LFPDPPP) y términos publicados.
  - Fichas de las tiendas, con la justificación del uso de ubicación.
  - Runbook de despliegue y rollback.
- **Aceptación:** la empresa de JP puede instalar la app de prueba y operar un viaje real en el piloto.

---

## 3. Requisitos previos (antes de lanzar el workflow)

| Qué | Para qué bloque | Responsable |
|---|---|---|
| ✅ Docker (Colima), Node, pnpm, Supabase CLI y GitHub CLI en la máquina | B00 y B01 | Mateo |
| ✅ CLI de Greptile con sesión iniciada · ⏳ Greptile activado en el repo `mateopirela/transport` | Todos | Mateo |
| ✅ D14 (gate de merge) y D15 (acceso de operadores) decididos | B00, B04 y B17 | Mateo |
| Cuenta de Expo/EAS | B17 | Mateo |
| Clave de Google Maps Platform con facturación (Places, Maps JS, Maps SDK y Routes) | B08, B13 y B19 | Mateo |
| ✅ Lista oficial de documentos por perfil (D16), recibida el 2026-10-16 | G3 | JP |
| Cuenta de Stripe (México) con un producto y un precio en MXN por plan, y el webhook apuntando a la Edge Function | H3 (D24-E1). No hace falta para construir ni para el piloto: sin claves todo queda en "Piloto gratis" | Mateo |
| Apple Team ID y huella SHA-256 del certificado de Android, para los enlaces universales del viaje | H2 (opcional: sin ellos el enlace abre la página web con "Abrir en la app") | Mateo |
| Precios y planes de la suscripción, y fecha de fin del piloto | H3 (se construye con "Por definir") | Mateo / JP |
| Corredores y tramos que usa la flota de JP, y fuentes de inseguridad que él consulta | H4 (se construye con datos semilla marcados "estimado") | JP |
| Apple Developer ($99 USD/año) y Google Play Console ($25 USD) | B27 | Mateo / Fulmis |
| Proyectos Supabase en la nube y Vercel | B27 | Mateo |
| Proveedor de email transaccional (Resend o similar) y dominio | B09 y B27 | Mateo |

## 4. Riesgos técnicos y mitigación

| Riesgo | Mitigación |
|---|---|
| Ubicación en segundo plano rechazada por las tiendas o cortada por el sistema operativo | B22 con 🔒, pruebas en dispositivos reales (incluyendo Android de gama baja), justificación clara y rastreo solo en viaje activo |
| Costo de Google Maps | Top N, caché de distancias, PostGIS para el prefiltro |
| Condiciones de carrera al aceptar ofertas | RPC transaccional, `unique` parcial y test de concurrencia (B05) |
| Fuga de datos entre empresas | RLS en todo, pgTAP por tabla y auditoría en B24 |
| Conectividad en carretera | Colas offline para eventos, ubicaciones y fotos (B21–B23) |
| Agentes que se salen del alcance o hacen PR demasiado grandes | Plantilla de PR, `CLAUDE.md`, límite de tamaño, reglas de Greptile y gate de merge |
| Lista de documentos cambia | Requisitos como datos (D12) |

## 5. Después de la V1 (no se construye ahora)

> **Rediseño visual (U1–U9):** [plan-rediseno.md](plan-rediseno.md). Solo presentación; se ejecuta con el workflow `transport-redesign` (`.claude/workflows/`).
>
> **Ola H (pendientes de JP, 2026-10-20):** [§H](#h--pendientes-de-jp-2026-10-20): chat interno operador–coordinador (H1), viaje por enlace al operador (H2), suscripción con Stripe y piloto gratis (H3, retoma G8), carreteras: costo, inseguridad y cercanía (H4) y tiempos de espera de carga y descarga (H5).

Predicción de fin de descarga con los datos de `trip_events`; comparación de fotos con IA; pago del flete dentro de la plataforma y comisiones; emisión y validación de Carta Porte; integración con GPS de flotas (D17); calificaciones y reputación; app de cliente en móvil; inglés; hardware propio. La web del transportista **entró** a la V1 el 2026-10-16 (§G). La suscripción también entró, pero quedó pospuesta ese mismo día (D24, G8); se retoma en H3 (D24-E1). La predicción de fin de descarga empieza en H5 con estadística simple de los eventos (sin IA).

---

## §G · Respuestas de JP (2026-10-16)

El 2026-10-16, JP y Mateo respondieron las preguntas pendientes del piloto. Eso cambia el modelo de producto: el transportista se divide en **Gerente** y **Coordinador**, aparecen las **unidades de negocio**, el operador entra con **teléfono**, el hombre-camión es **Gerente + Operador**, llegan la lista oficial de documentos, los documentos compartidos al cliente, la cancelación con unidad pendiente de liberar, los enlaces compartidos y la **suscripción**. Las decisiones están en [decisiones.md](decisiones.md) (D06-E1, D08-E1, D13, D15-E1, D16, D17 y D19–D24) y el producto en [producto-v1.md](producto-v1.md) (§2, §3 y §6).

Toda la V1 anterior (B00–B27 y F1–F16) ya está en `main`. Estos bloques la modifican; cada uno es un PR con el ciclo de §0.1, la definición de terminado de §0.3 y el gate D14. Rama `v1/<id>-<slug>` (p. ej. `v1/G1a-roles-business-units`) y título `[G1a] BD: roles Gerente/Coordinador y unidades de negocio`.

### G.0 Reglas comunes de los bloques G

1. **Enums.** `alter type … rename value` y `alter type … add value` van en **su propia migración**, antes de la que usa el valor nuevo (Postgres no deja usar un valor agregado dentro de la misma transacción).
2. **Migraciones en paralelo.** Varios bloques G tocan a la vez `supabase/seed.sql`, `packages/shared/src/db.ts` y funciones compartidas (`assign_trip`, `cancel_trip`, `make_offer`, `notify_*`). Al rebasar: renombrar las migraciones para que queden después de las de `main`, regenerar `pnpm db:types` (no se resuelven conflictos de `db.ts` a mano) y, si otro bloque ya redefinió la función, partir de **su** versión (`create or replace` con el comentario "Same as <bloque>, except …", como en F5/F13).
3. **Rol literal.** Después de G1a nadie escribe `'carrier'` como `user_role`. Ojo: `company_type` y `offer_side` **siguen** teniendo `'carrier'` (es la empresa o el lado de la negociación, no el rol).
4. **Autorización.** Toda regla vive en Postgres (RLS y RPC `security definer` con `search_path = ''`, revocadas de `public` y `anon`). Las Edge Functions con *service role* solo llaman RPC `*_service` que validan sus argumentos.
5. **Notificaciones nuevas.** Cada valor nuevo de `notification_type` lleva su copy (título, cuerpo, email) en `packages/shared/src/copy/notifications.ts` y `notification-email.ts`, su ruta en la app y en la web, y test de copy.
6. **Textos de UI** en `packages/shared/src/copy/`. Términos: "Gerente", "Coordinador", "Operador", "Cliente", "Hombre camión", "Unidad de negocio" (plural "Unidades de negocio"). **"Unidad" o "camión" sigue siendo el vehículo**; nunca se dice solo "unidad" para un grupo.
7. **E2E.** Cada bloque indica qué pruebas existentes probablemente se rompen. Arreglarlas es parte del bloque, no un seguimiento. La suite pgTAP sigue pasando con y sin seed (F3/F10).
8. **Tamaño.** Si un bloque pasa de ~800 líneas (sin generados), se divide como dice el propio bloque.

**Helpers de autorización después de G1a** (todos `stable security definer`, `search_path = ''`, solo leen la fila del que llama):

| Helper | Devuelve |
|---|---|
| `auth_role()`, `auth_company_id()`, `is_admin()`, `auth_shipper_company_id()`, `auth_operator_id()` | Sin cambio |
| `auth_carrier_company_id()` (nuevo) | La empresa transportista activa del que llama si su rol es `manager` o `coordinator`; si no, `null` |
| `auth_fleet_company_id()` | **Solo para `manager`** (control total de la empresa). Mismo significado que hoy |
| `auth_is_manager()` (nuevo) | `true` si es Gerente de una empresa transportista activa |
| `auth_business_unit_ids()` (nuevo) | `uuid[]`: Gerente → todas las unidades de negocio activas de su empresa; Coordinador → las que tiene asignadas y activas; cualquier otro → `'{}'` |
| `can_operate_unit(p_unit_id uuid)` (nuevo) | `p_unit_id = any(auth_business_unit_ids())` |

**Usuarios demo después de §G** (contraseña `Demo1234`, solo local; G1a y G2 los crean, G9 deja la tabla final en `docs/demo-local.md`):

| Usuario | Perfil | Empresa · unidad de negocio |
|---|---|---|
| `jorge.villarreal@demo.test` | Gerente | Transportes Regios del Norte (ve y opera todo) |
| `andrea.cavazos@demo.test` (nueva) | Coordinadora | TRN · "Corredor MTY–GDL": `TRN-01`, `CS53-01`, Pedro López |
| `hector.ibarra@demo.test` (nuevo) | Coordinador | TRN · "Regional Monterrey": `RF53-01`, `TT-01`, Raúl Méndez, Arturo Cantú |
| `carmen.navarro@demo.test` | Gerente | Fletes Tapatíos · "Principal" |
| `jose.sanchez@demo.test` | Hombre-camión (Gerente + Operador) | José Sánchez Medina · "Principal" |
| `pedro.lopez@demo.test`, `raul.mendez@demo.test`, `miguel.hernandez@demo.test` | Operador (correo, como hoy) | Sin cambio |
| `+52 81 1000 0013` (nuevo, G2) | Operador con teléfono (Iván Garza) | TRN · "Regional Monterrey" |
| Clientes y admin | Sin cambio | Sin cambio |

Jorge queda **solo como Gerente**: los flujos de Maestro y Playwright que hoy entran como Jorge siguen funcionando (el Gerente opera todo) y las coordinadoras nuevas prueban el aislamiento por unidad de negocio.

### G.1 Olas y dependencias

```
Ola GA   G1a
Ola GB   G1b · G3 · G10a                     (tras G1a)
Ola GC   G2 (G1b, G10a) · G10b (G10a, G3) · G7 (G10a)
Ola GD   G4 (G2, G10b) · G5 (G10b) · G6 (G10b)
Ola GE   G9 (todos)
```

| Bloque | Depende de |
|---|---|
| G1a | `main` |
| G1b | G1a |
| G3 | G1a |
| G10a | G1a |
| G10b | G10a, G3 |
| G2 | G1b, G10a |
| G7 | G10a |
| G8 | Pospuesto (D24) |
| G4 | G2, G10b |
| G5 | G10b |
| G6 | G10b (y por ella G3 y G1a) |
| G9 | G1a, G1b, G2, G3, G4, G5, G6, G7, G10a, G10b |

**Ajustes al reparto propuesto, y por qué:**
- **G1 se divide en G1a y G1b.** Renombrar el rol, crear las unidades de negocio y reescribir ~50 políticas y RPC ya excede las ~800 líneas; las invitaciones por enlace son independientes y van en G1b.
- **Bloques nuevos G10a y G10b (web del transportista).** D06-E1 da web al Gerente y al Coordinador, pero hoy `apps/web` no tiene ninguna pantalla de transportista (los manda a `/solo-app`). Sin esa base, G2, G4, G5, G6, G7 y G8 no tendrían dónde poner su parte web.
- Por lo mismo, G2, G4, G5, G6, G7 y G8 dependen de G10a o G10b, y G10b depende de G3 (muestra el checklist de documentos del viaje).

---

#### G1a · BD y permisos: roles Gerente/Coordinador y unidades de negocio 🔒
- **Objetivo:** que el rol `carrier` pase a ser `manager` (Gerente), exista `coordinator` y que los coordinadores vean y operen solo sus unidades de negocio, sin romper nada de lo que ya funciona.
- **Depende de:** `main`.
- **Alcance:**
  - **Migración 1** (`…_user_role_manager_coordinator.sql`), sola: `alter type public.user_role rename value 'carrier' to 'manager'; alter type public.user_role add value 'coordinator';`. Las filas existentes (`profiles.role`, `messages.sender_role`, `trip_events.actor_role`) quedan en `manager` solas; las políticas se actualizan solas (guardan el OID). **Los cuerpos de funciones no**: son texto y fallan en ejecución si dicen `'carrier'`.
  - **Migración 2** (`…_business_units.sql`):
    - Tablas `business_units` y `business_unit_coordinators` (abajo).
    - Columna `business_unit_id uuid not null` en `vehicles`, `operators`, `negotiations` y `trips`, con FK compuesta a `business_units (company_id, id)` (`carrier_company_id` en negociaciones y viajes) e índices. Backfill: una unidad de negocio **"Principal"** por empresa transportista existente, y todo lo existente a ella.
    - `companies.is_owner_operator boolean not null default false` (lo usa G2; se agrega aquí para que la seed marque a José).
    - Trigger `companies_create_default_business_unit` (after insert, `type = 'carrier'`): crea "Principal".
    - Trigger `fleet_default_business_unit` (before insert en `vehicles` y `operators`): si `business_unit_id` es nulo, usa la única unidad de negocio activa de la empresa, o la única del coordinador que inserta; si hay varias, error `23502 business_unit_id is required`. Así las pantallas actuales de alta siguen funcionando hasta G4.
    - Trigger `fleet_guard_business_unit` (before update en `vehicles` y `operators`): un `coordinator` no puede cambiar `business_unit_id` ni `archived_at` (eso es de G4 y del Gerente).
    - Helpers de la tabla de G.0.
    - `notify_carrier_staff(p_company_id uuid, p_business_unit_id uuid, p_type notification_type, p_data jsonb)`: Gerentes de la empresa + coordinadores de esa unidad de negocio (si no es nula), sin el que llama. Reemplaza las llamadas `notify_company(…, 'carrier', …)`.
  - **Funciones a recrear porque nombran el rol** (confirmar con `git grep -n "'carrier'" supabase/migrations` y con el test de higiene):
    - `handle_new_user`: acepta `shipper`, `manager`, `coordinator` y `operator`; `carrier` llega de builds viejas y se guarda como `manager`.
    - `create_company`: `manager` → empresa `carrier`; `coordinator` y `operator` no crean empresa (un `user_role::text::company_type` ya no sirve; mapear explícito).
    - `submit_document`, `request_company_review`, `auth_fleet_company_id`.
    - `notify_offer`, `notify_trip_event` (incluye la excepción del hombre-camión, que hoy compara `p.role = 'carrier'`), `notify_load_match` (ahora por unidad de negocio: la mejor unidad de cada unidad de negocio con camión compatible), `notify_document_review` y `process_document_expiry` (hacen `company_type::text::user_role`, que se rompe con el renombre).
  - **Políticas a reescribir** con `business_unit_id = any((select public.auth_business_unit_ids()))` (el Gerente tiene todas, así que para él no cambia nada): `vehicles_select`/`vehicles_update`, `operators_select`/`operators_insert`/`operators_update`, `operator_invitations_select`, `vehicle_availability_select` (por la unidad de negocio del vehículo), `negotiations`/`offers` (lado transportista), `loads_select` (las publicadas: cualquier `auth_carrier_company_id()` de empresa aprobada; las negociadas: por la unidad de negocio de la negociación), `trips_select`, `trip_locations_select`, `documents_select` y Storage `documents` (empresa: Gerente escribe, Coordinador lee; vehículo/operador: por unidad de negocio), Storage `trip-documents` y `evidence`, `is_conversation_participant`, `carrier_routes` (siguen siendo de empresa: las leen y escriben Gerente y Coordinador vía `auth_carrier_company_id()`). `vehicles_insert` sigue siendo solo del Gerente.
  - **RPC a reescribir** (`company_id is distinct from auth_fleet_company_id()` → `not can_operate_unit(<unidad de negocio de la fila>)`): `set_vehicle_availability`, `clear_vehicle_availability`, `create_operator_invitation`, `revoke_operator_invitation`, `make_offer`, `lock_offer_for_response`, `counter_offer`, `reject_offer`, `withdraw_offer`, `assign_trip`, `cancel_trip`, `add_trip_document`, `report_incident`, `resolve_incident`, `match_candidates`/`match_pairs` (solo vehículos de sus unidades de negocio).
    - `make_offer(p_load_id, p_amount_cents, p_conditions default null, p_vehicle_id default null, p_business_unit_id default null)`: la unidad de negocio sale de `p_business_unit_id`, o de la del vehículo, o de la única del que llama; si es ambigua, error. El vehículo debe ser de esa unidad de negocio. **Una negociación por carga y empresa** (se mantiene `negotiations_load_carrier_key`): si otra unidad de negocio de la misma empresa ya negocia la carga, error `23505` con copy "Otra unidad de negocio de tu empresa ya negocia esta carga" (el Gerente sí puede operarla).
    - `create_trip_for_accepted_offer` copia `negotiations.business_unit_id` al viaje.
    - `assign_trip`: un Coordinador solo asigna vehículo y operador de la unidad de negocio del viaje; el Gerente puede usar cualquiera, y el viaje pasa a la unidad de negocio del vehículo. Se conserva el orden de bloqueo de F5 (viaje → vehículos en orden de id).
  - `packages/shared`: tipos regenerados, `USER_ROLE_LABELS` (`manager` "Gerente", `coordinator` "Coordinador"), helpers puros `isCarrierStaff(role)` y `isManager(role)`, copy.
  - **Adaptación mínima de las apps:**
    - Web: `manager` y `coordinator` van a `/solo-app` hasta G10a; el admin ve los roles nuevos en Usuarios.
    - App: `resolveArea` manda `manager` y `coordinator` al área de transportista. El Coordinador no ve "Agregar unidad", ni las bajas, ni la subida de documentos de empresa (los ve en solo lectura). Cada camión y operador muestra el nombre de su unidad de negocio.
    - `dispatch-notifications`: tipos actualizados (sin cambio de comportamiento).
  - **Seed:** roles renombrados; en TRN, las unidades de negocio "Corredor MTY–GDL" y "Regional Monterrey" y los coordinadores de la tabla de G.0 (`5eed0001-…-000000000011` Andrea Cavazos, `…012` Héctor Ibarra); Fletes Tapatíos y José, con "Principal"; José con `is_owner_operator = true`; negociaciones y viajes con su unidad de negocio. `docs/demo-local.md` con los usuarios nuevos.
- **Fuera de alcance:** invitaciones por enlace (G1b), registro (G2), pantallas de gestión del Gerente (G4), web del transportista (G10a).
- **Modelo de datos:**
  - `business_units`: `id`, `company_id` (FK a una empresa `carrier`), `name` (1–80), `created_by`, `created_at`, `updated_at`, `archived_at`; `unique (company_id, id)`; índice único `(company_id, lower(name)) where archived_at is null`.
  - `business_unit_coordinators`: `business_unit_id`, `company_id`, `profile_id` (FK `profiles`, `on delete cascade`), `created_by`, `created_at`; PK `(business_unit_id, profile_id)`; FK compuesta `(company_id, business_unit_id)`; trigger que exige que el perfil sea `coordinator` de esa empresa.
  - Escrituras solo por RPC (G4) o en la seed; en G1a no hay RPC de gestión.
- **RLS:** `business_units`: select para el personal de la empresa (`auth_carrier_company_id()`) y admin. `business_unit_coordinators`: el Gerente ve todas las de su empresa; el Coordinador, las suyas; admin todas. Sin insert, update ni delete para clientes.
- **Tests:**
  - pgTAP `26_business_units_rls.test.sql`: matriz Gerente / Coordinador A / Coordinador B / Gerente de otra empresa / operador / cliente × `vehicles`, `operators`, `vehicle_availability`, `negotiations`, `offers`, `loads`, `trips`, `trip_events`, `trip_locations`, `trip_evidence`, `trip_documents`, `conversations`, `messages`, `documents` y Storage. Y las RPC: el Coordinador B no puede ofertar con un camión de A, ni asignar, cancelar o cambiar la disponibilidad de A.
  - pgTAP `27_role_migration.test.sql`: el enum ya no tiene `carrier`; un registro con rol `carrier` queda `manager`; un Coordinador no crea empresa; **higiene**: ninguna función de `public` tiene en su cuerpo `role … 'carrier'`, `notify_company(… 'carrier'` ni `::text::public.user_role`.
  - Actualizar todos los pgTAP y `supabase/seed-tests` que crean usuarios con rol `carrier`, incluida la matriz de `security_matrix.test.sql` (agregar Coordinador y "Coordinador de otra unidad de negocio").
  - Vitest de los helpers de rol y de `resolveArea`.
- **Aceptación:**
  - `supabase db reset` aplica con y sin seed; la suite pgTAP y los seed-tests pasan.
  - Andrea ve `CS53-01`, su viaje y su chat; Héctor no ve nada de eso, pero sí las cargas publicadas; Jorge ve todo.
  - Playwright (3 specs) y Maestro 01–07 pasan sin cambiar su intención.
- **E2E que probablemente se rompan:** `e2e/support/demo.ts` y `actors.ts` (tipos de rol); `apps/web/src/lib/routing.test.ts`; `apps/mobile/src/lib/routing.test.ts`; `supabase/functions/dispatch-notifications/handler.test.ts` (`role: 'carrier'`); `packages/shared/src/copy/notification-email.test.ts`; casi todos los `supabase/tests/database/*.test.sql` (crean usuarios `carrier`); `seed-tests/security_matrix.test.sql`. Maestro: el `sign-in` de todos los flujos depende de `resolveArea`.
- **Revisión 🔒:** que ningún helper nuevo cause recursión de políticas; que no quede ningún `'carrier'` de rol; que el orden de bloqueo de F5 no cambie; que un Coordinador sin unidades de negocio no vea nada de la flota. Si crece de más: **G1a.1** (renombre del rol y funciones) y **G1a.2** (unidades de negocio y RLS).

#### G1b · Invitaciones por enlace: coordinador y operador 🔒
- **Objetivo:** que el Gerente invite coordinadores, y el Gerente o el Coordinador inviten operadores (o les restablezcan el acceso), con un enlace de un solo uso.
- **Depende de:** G1a.
- **Alcance:**
  - Enum `invitation_kind`: `coordinator`, `operator`, `operator_access_reset`.
  - Tabla `invitations`: `id`, `company_id`, `kind`, `business_unit_ids uuid[]` (coordinador: 1 o más; operador: exactamente 1), `operator_id` (obligatorio en `operator_access_reset`; en `operator` se llena al canjear), `invitee_name` (opcional, solo para mostrar), `token_hash bytea unique not null`, `expires_at`, `created_by`, `created_at`, `accepted_at`, `accepted_by`, `revoked_at`; checks de un solo desenlace y de forma por tipo.
  - **Token:** 32 bytes de `gen_random_bytes` en base64url (43 caracteres); solo se guarda el SHA-256. Enlace web `/invitacion/<token>`; deep link `transport://invitacion/<token>`. Vence a los 7 días por defecto (de 1 a 720 horas).
  - RPC:
    - `create_invitation(p_kind, p_business_unit_ids uuid[], p_operator_id uuid default null, p_invitee_name text default null, p_valid_for_hours integer default 168)` → `(invitation_id, token, expires_at)`. `coordinator`: solo el Gerente. `operator` y `operator_access_reset`: Gerente, o Coordinador con `can_operate_unit` sobre la unidad de negocio (y el operador debe ser de ella). Reemitir revoca la pendiente del mismo operador. Pasa por `consume_rate_limit('create_invitation')`.
    - `revoke_invitation(p_invitation_id)`.
    - `invitation_preview(p_token text)`, otorgada a `anon` y `authenticated`: devuelve `kind`, `company_legal_name`, nombres de las unidades de negocio, nombre de quien invita y `expires_at`. Mismo error para desconocida, vencida, usada o revocada (`22023 invalid or expired invitation`); no devuelve ids.
    - `accept_coordinator_invitation(p_token text)`: quien llama tiene rol `coordinator`, sin empresa y con correo confirmado; lo liga a la empresa y a las unidades de negocio. Bloquea invitación → perfil.
    - `redeem_operator_invitation_service(p_token text, p_user_id uuid, p_full_name text, p_phone text, p_email text)`: **solo `service_role`** (la llama la Edge Function de G2). `operator`: crea la fila de `operators` en la unidad de negocio, ligada a `p_user_id`, y pone la empresa en el perfil. `operator_access_reset` (con `p_user_id` nulo): valida, marca usada y devuelve el perfil del operador. Siempre devuelve `(operator_id, profile_id, kind)`.
  - `operator_invitations` (B04, por correo) queda como está; G2 la retira.
  - `packages/shared`: `invitationUrl(siteUrl, token)` y `parseInvitationLink(url)`.
- **Fuera de alcance:** la Edge Function de canje y las pantallas (G2); la lista de invitaciones del Gerente (G4).
- **RLS:** `invitations` select: el Gerente, todas las de su empresa; el Coordinador, las de operador de sus unidades de negocio; admin. `token_hash` nunca se otorga a `authenticated`. Sin escrituras de clientes.
- **Tests:** pgTAP `28_invitations.test.sql`: matriz; vencida, usada y revocada fallan igual; un Coordinador no invita coordinadores ni a otra unidad de negocio; un cliente no acepta; `redeem_…_service` falla para `authenticated`; dos `accept` concurrentes del mismo token: gana uno (patrón de `04_fleet_concurrency`). Vitest de los helpers de enlace.
- **Aceptación:** con la seed, Jorge crea una invitación de coordinador y su preview anónimo muestra "Transportes Regios del Norte"; un token adivinado no revela nada.
- **E2E que probablemente se rompan:** ninguno.
- **Revisión 🔒:** entropía del token, que el preview anónimo no filtre datos, orden de bloqueo.

#### G3 · Documentos D16 y documentos por viaje (D22)
- **Objetivo:** cargar la lista oficial de JP como datos y modelar los documentos de cada viaje: quién sube cada uno y en qué etapa.
- **Depende de:** G1a.
- **Alcance:**
  - **Catálogo `document_requirements`** (migración de datos, sin borrar filas):
    - Archivar (`archived_at`): `articles_of_incorporation`, `proof_of_address`, `sct_permit` y `carrier_insurance_policy` (empresa).
    - Columna nueva `optional_for public.company_type[] not null default '{}'`: el requisito aplica pero no es obligatorio para esos tipos de empresa. `legal_representative_id` → `optional_for = '{shipper}'` ("cuando se requiera"). `company_missing_requirements` lo respeta.
    - Columna nueva `shareable_with_shipper boolean not null default false` (la usa G6). `true` en `tax_status_certificate`, `vehicle_registration_card`, `vehicle_permit`, `vehicle_insurance_policy` y `federal_driver_license`; `false` en las identificaciones (datos personales; ver Seguimiento).
    - Nuevas: `operator_official_id` (operador, "Identificación oficial", "INE u otra identificación oficial vigente", con vencimiento) y `vehicle_permit` (unidad, "Permisos correspondientes", "Permiso SICT de autotransporte federal y los especiales que apliquen").
    - Renombrar textos: `federal_driver_license` → "Licencia de conducir vigente" ("Federal (SICT), del tipo adecuado a la unidad"); `vehicle_insurance_policy` → "Seguro vigente".
    - Placas, tipo de unidad y capacidad ya son campos de `vehicles`: sin cambio.
  - **Licencia adecuada al vehículo:** tabla de datos `license_unit_compatibility (license_type, vehicle_kind)` con la lista provisional B → tractor, rígido y remolque; C → rígido; E → todos. Además, una carga con `hazmat_permit` exige licencia E. `assign_trip` valida que el operador tenga licencia vigente (documento aprobado no vencido o `license_expires_on` ≥ hoy) y compatible; error con copy "La licencia de {operador} no es adecuada para esta unidad".
  - **Documentos del viaje:**
    - Migración sola: `alter type trip_document_kind add value 'service_order'` y `'invoice'`. `carta_porte` se queda con la etiqueta "CFDI con complemento Carta Porte".
    - Enum `trip_document_stage` (`before_departure`, `billing`) y tabla de datos `trip_document_requirements`: `kind` (PK), `stage`, `uploader_sides offer_side[]`, `is_required`, `blocks_departure boolean default false`, `sort_order`; editable por admin y auditada. Filas: `service_order` (antes de salir; cliente y transportista), `carta_porte` (antes de salir; transportista), `invoice` (para cobrar; transportista), `other` (opcional; ambos).
    - `add_trip_document` (misma firma): el cliente del viaje sube los tipos con `'shipper'` en `uploader_sides`; el personal con `can_operate_unit(trip.business_unit_id)`, los de `'carrier'`. Política de Storage `trip-documents` para el cliente.
    - `record_trip_event('departed')`: si un requisito con `blocks_departure` falta, error `55000` (ninguno bloquea por defecto: D22).
    - RPC `trip_checklist(p_trip_id)` (`security invoker`): una fila por documento o evidencia, con `code`, `stage`, `responsible` (`shipper`, `carrier` u `operator`), `required` y `done_at`. Combina `trip_document_requirements`, la evidencia mínima de `trip_evidence_requirements` y el nombre de quien recibe (evidencia firmada de entrega).
  - **Vencimientos:** `process_document_expiry` (B09) ya avisa de todo documento con `expires_at`; G3 hace que avise también al **coordinador de la unidad de negocio** del vehículo u operador (`notify_carrier_staff`), además del Gerente y del operador.
  - **UI app:** documentos del operador (identificación y licencia) y de la unidad (tarjeta, permisos y seguro) desde el catálogo; checklist "Documentos del viaje" en el detalle del viaje del transportista, con subida; el operador ve en solo lectura la orden de servicio y la Carta Porte de su viaje (las necesita en carretera).
  - **UI web del cliente:** checklist del viaje y subida de la orden de servicio en `/cliente/viajes/[id]`.
  - **Seed:** documentos aprobados de los requisitos nuevos para todas las empresas, unidades y operadores, para que la aprobación y el *matching* no cambien.
- **Fuera de alcance:** compartir documentos con el cliente (G6); la web del transportista (G10b muestra el checklist).
- **RLS:** `trip_document_requirements` y `license_unit_compatibility`: lectura para `authenticated`, escritura solo admin (con auditoría). `trip_documents` sin cambio de lectura.
- **Tests:** pgTAP `29_d16_requirements.test.sql` (faltantes por tipo de empresa, persona física o moral, `optional_for`, y una unidad sin permiso no está lista para *matching*), `30_trip_documents.test.sql` (quién sube cada tipo, `blocks_departure`, `trip_checklist`) y casos de licencia en `assign_trip`. Vitest: agrupación del checklist y compatibilidad de licencia (espejo puro de la tabla).
- **Aceptación:** el registro de cliente y de transportista pide exactamente la lista D16; el cliente sube la orden de servicio y el coordinador ve el checklist completo; asignar un operador con licencia C a un tractocamión falla con mensaje claro.
- **E2E que probablemente se rompan:** `return-trip.spec.ts` y Maestro `01`/`03` si la seed no aprueba `vehicle_permit` (`CS53-01` dejaría de estar lista); `shipper-journey.spec.ts` (cambia la cantidad de documentos; el ciclo de subida es genérico, verificarlo); `seed-tests/seed.test.sql` (documentos completos de las empresas aprobadas); pgTAP `02_documents` y `06_vehicle_readiness`.

#### G10a · Web del transportista: base, cargas y negociación
- **Objetivo:** que el Gerente y el Coordinador trabajen en la web (D06-E1): inicio con recomendaciones, búsqueda de cargas, ofertas y chat.
- **Depende de:** G1a.
- **Alcance:**
  - Ruteo: `manager` y `coordinator` → `/transportista`; `/solo-app` queda solo para el operador. Empresa en revisión → `/cuenta-en-revision`. Gerente sin empresa → `/completar-registro` (G2 le pone los datos fiscales; mientras tanto, el formulario actual).
  - Layout `/transportista` con navegación: Inicio, Cargas, Negociaciones, Viajes (G10b), Flota (G10b), Mi empresa (G4) y Notificaciones; selector de unidad de negocio ("Todas" para el Gerente).
  - Páginas: `/transportista` (cargas recomendadas por unidad y "Viajes de regreso", con la Edge Function `recommendations` y el mismo respaldo de scoring local que la app); `/transportista/cargas` (búsqueda y filtros); `/transportista/cargas/[id]` (detalle con mapa y km en vacío; ofertar con un camión de sus unidades de negocio); `/transportista/negociaciones` y `/transportista/negociaciones/[id]` (contraofertar, aceptar, rechazar y chat en tiempo real); `/transportista/notificaciones`.
  - Reutilizar la lógica de `apps/mobile/src/lib/loads-api.ts`: si hace falta, moverla a `packages/shared` (sin cambiar su comportamiento en la app).
  - `dispatch-notifications`: `EMAIL_ROLES` suma `manager` y `coordinator`; `notificationWebPath` les da rutas de `/transportista/…`.
- **Fuera de alcance:** viajes y flota (G10b), gestión de la empresa (G4).
- **Tests:** Vitest de ruteo y de `notificationWebPath`. Playwright `carrier-web-offer.spec.ts`: Andrea entra a la web, ve como primera recomendación de `CS53-01` la carga GDL → MTY y oferta; Héctor no ve esa recomendación.
- **Aceptación:** el escenario estrella (B26) se puede hacer en la web del transportista; ninguna pantalla muestra datos de otra unidad de negocio a un Coordinador.
- **E2E que probablemente se rompan:** `apps/web/src/lib/routing.test.ts`, `notification-email.test.ts` (`carrier` ya tiene ruta), `handler.test.ts` (correo a roles nuevos).

#### G10b · Web del transportista: viajes y flota
- **Objetivo:** completar la web del transportista con viajes, asignación, documentos del viaje y flota.
- **Depende de:** G10a y G3.
- **Alcance:**
  - `/transportista/viajes` (filtros por estado y unidad de negocio; el Gerente ve todos) y `/transportista/viajes/[id]`: asignar camión y operador, mapa en vivo, línea de tiempo, evidencia, checklist de documentos (G3) con subida, chat del viaje y cancelar.
  - `/transportista/flota/unidades` y `/[id]` (datos, documentos y disponibilidad), `/transportista/flota/operadores` y `/[id]` (datos y documentos), `/transportista/rutas`.
  - El Coordinador no ve el alta ni las bajas (son del Gerente; G4).
  - Reutilizar el formulario de documentos de B12.
- **Fuera de alcance:** cambiar de unidad de negocio, bajas e invitaciones, también las del Coordinador a sus operadores (G4).
- **Tests:** Playwright `carrier-web-assign.spec.ts` (Andrea asigna `CS53-01` y Pedro al viaje ganado en G10a); Vitest de lo puro nuevo.
- **Aceptación:** lo que hace hoy el transportista en la app (B18–B20) se puede hacer en la web.
- **E2E que probablemente se rompan:** ninguno.

#### G2 · Registro y alta: datos fiscales, teléfono, invitaciones y hombre-camión 🔒
- **Objetivo:** el registro de D16 para todos los perfiles, en web y app, con el operador por teléfono y la opción "Hombre camión".
- **Depende de:** G1b y G10a.
- **Alcance:**
  - **Datos fiscales de la empresa** (cliente y transportista): columnas en `companies`: `fiscal_street`, `fiscal_exterior_number`, `fiscal_interior_number` (opcional), `fiscal_neighborhood`, `fiscal_postal_code` (5 dígitos), `fiscal_municipality`, `fiscal_state` (uno de los 32 estados; catálogo `MX_STATES` en `shared`) y `legal_representative_name`. RFC: el formato y la fecha ya se validan (`parseRfc`); el dígito verificador sigue como pista para el admin (B02).
  - RPC `register_company(p_payload jsonb)`: `kind` `shipper` | `carrier` | `owner_operator`, razón social, RFC, domicilio fiscal, representante legal y contacto. Para `owner_operator`: empresa `carrier` con `is_owner_operator = true`, unidad de negocio "Principal" y una fila de `operators` ligada al perfil del que llama, en esa unidad de negocio (D13). `create_company` se queda como envoltura para builds viejas (la empresa queda con datos fiscales faltantes).
  - `company_missing_fields(p_company_id)`: lo que falta de los datos fiscales; `review_company` no aprueba una empresa con faltantes; el panel de verificación (B12) los muestra.
  - **Teléfono obligatorio:** `normalizeMxPhone` en `shared` (E.164, `+52` y 10 dígitos); `handle_new_user` lo exige a todos los roles; check `profiles.phone ~ '^\+[1-9][0-9]{7,14}$'`; la migración normaliza los existentes (quita espacios y guiones). Quien no tenga teléfono ve "Completa tu teléfono" en su perfil.
  - **Operador por teléfono (D15-E1).** Se eligió **correo sintético + Edge Function** sobre Supabase Auth por teléfono sin OTP:
    - Con el proveedor de teléfono de Supabase Auth y confirmaciones apagadas, cualquiera podría crear cuentas con cualquier número por el endpoint público de registro, y el proveedor de teléfono pide configurar SMS.
    - Con correo sintético, la cuenta **solo** la crea la Edge Function con una invitación válida, y el login es el mismo `signInWithPassword` por correo que ya usan web y app, en local y en la nube.
    - Correo de Auth: `52XXXXXXXXXX@tel.transport.invalid`. El TLD `.invalid` (RFC 2606) nunca entrega correo. Helpers en `shared`: `phoneAuthEmail(e164)` y `resolveLoginIdentifier(input)` (correo o teléfono → correo de Auth).
  - **Edge Function `redeem-invitation`** (`verify_jwt = false`). Recibe `{ token, fullName, phone, password, email? }`, validado con el zod `operatorRedeemSchema` de `shared`. Pasos:
    1. Límite de frecuencia por IP (hash) y por token con `consume_service_rate_limit`.
    2. `invitation_preview` para validar el token.
    3. `operator`: `auth.admin.createUser({ email: phoneAuthEmail(phone), password, email_confirm: true, user_metadata: { role: 'operator', full_name, phone }, app_metadata: { provisioned_by: 'redeem-invitation' } })` y luego `redeem_operator_invitation_service`. Si la RPC falla, borra el usuario creado (compensación).
    4. `operator_access_reset`: primero `redeem_operator_invitation_service(token, null, …)`, que bloquea la invitación, la marca usada y devuelve el `profile_id` del operador (el preview no da ids). Después, `auth.admin.updateUserById(profile_id, { password })` y `auth.admin.signOut` de sus sesiones. Si el cambio de contraseña falla, el enlace ya quedó usado: la respuesta pide generar otro, nunca deja dos canjes válidos del mismo enlace.
    5. Nunca registra en logs ni Sentry el teléfono ni la contraseña.
  - `handle_new_user` acepta el rol `operator` **solo** si `raw_app_meta_data ->> 'provisioned_by' = 'redeem-invitation'` (solo la *service role* puede escribir `app_metadata`). Se retira el flujo B04/B17 de operador por correo: se revocan las `operator_invitations` pendientes y se borran `create_operator_invitation` y `accept_operator_invitation` (la tabla queda como historial). Los operadores que ya entran con correo siguen entrando igual.
  - **Coordinador:** `/invitacion/[token]` (web) y `invitacion/[token]` (app) muestran el preview. Formulario de nombre, correo, teléfono y contraseña → `auth.signUp` con rol `coordinator` y `emailRedirectTo` a `/invitacion/<token>`. Al volver confirmado, `accept_coordinator_invitation`. Si ya tiene sesión como Coordinador sin empresa, solo un botón "Unirme".
  - **Operador:** la misma ruta muestra nombre, teléfono, contraseña y correo (opcional) → `redeem-invitation` → inicia sesión con su teléfono. En la web, al terminar: "Descarga la app y entra con tu teléfono" (el operador solo usa la app) y botón "Abrir en la app".
  - **Login** web y app: un campo "Correo o teléfono".
  - **Hombre camión:** en `/registro` (web) y en el registro de la app se elige "Soy cliente", "Soy transportista (empresa)" o "Soy hombre camión". En la app, un Gerente con fila de operador propia ve, además de las pestañas del transportista, la pestaña **"Mi viaje"** (las pantallas del operador: estados, ubicación y evidencia). En la web ve el área de transportista.
  - **Seed:** datos fiscales de todas las empresas, teléfonos normalizados, el operador por teléfono Iván Garza (`+52 81 1000 0013`, TRN "Regional Monterrey") y dos invitaciones demo con token fijo (solo local): `/invitacion/demo-coordinador-trn` y `/invitacion/demo-operador-trn`.
- **Fuera de alcance:** la lista de invitaciones y "restablecer acceso" en la UI del Gerente (G4, que usa las RPC de G1b).
- **Tests:**
  - pgTAP `31_registration.test.sql`: `register_company` por tipo, datos fiscales obligatorios para aprobar, el hombre-camión crea su fila de operador, teléfono obligatorio y con formato, y el rol `operator` solo con `provisioned_by`.
  - Deno: `redeem-invitation` con cliente admin simulado: alta exitosa, compensación, token inválido, límite de frecuencia, teléfono ya registrado, **restablecimiento exitoso** (canjea, cambia la contraseña del `profile_id` devuelto y cierra sesiones) y **segundo canje del mismo enlace rechazado** (sin tocar la contraseña).
  - Vitest: teléfono, identificador de login y esquemas.
  - Playwright `invitations.spec.ts`: coordinador por enlace con confirmación en Mailpit; operador por enlace, que después entra con su teléfono.
  - Maestro `08-operator-invite.yaml`: el operador crea su cuenta desde el enlace y ve "Sin viaje asignado".
- **Aceptación:** los cuatro perfiles y el hombre-camión se registran en web y app con los datos de D16; un operador sin correo entra con teléfono y contraseña; nadie crea una cuenta de operador sin invitación.
- **E2E que probablemente se rompan:** `shipper-journey.spec.ts` (el registro pide domicilio fiscal y representante); el subflujo de Maestro `sign-in.yaml` (etiqueta "Correo o teléfono"); la pantalla `invite.tsx` de la app y sus tests; los tests de invitación de `03_fleet_rls` y `04_fleet_concurrency` (las RPC viejas se borran: portarlos a G1b); `packages/shared/src/schemas/auth.test.ts`.
- **Revisión 🔒:** que solo la Edge Function cree operadores; compensación; que no haya enumeración de teléfonos sin token válido; que no haya PII en los logs. Si crece de más: **G2a** (BD, datos fiscales y hombre-camión) y **G2b** (operador por teléfono e invitaciones).

#### G4 · Apartado del Gerente: Mi empresa (web y app)
- **Objetivo:** que el Gerente organice unidades de negocio, coordinadores, camiones y operadores, y los edite o dé de baja sin romper viajes activos.
- **Depende de:** G2 y G10b.
- **Alcance:**
  - RPC (solo Gerente, `security definer`, con mensajes en `copy/errors`):
    - `create_business_unit(p_name)`, `rename_business_unit(p_id, p_name)`.
    - `archive_business_unit(p_id)`: falla si tiene camiones u operadores activos, o negociaciones o viajes abiertos; quita las asignaciones de coordinadores.
    - `set_coordinator_units(p_profile_id, p_unit_ids uuid[])`: 1 o más unidades de negocio.
    - `remove_company_member(p_profile_id)`: un Coordinador pierde sus unidades de negocio y su empresa (sus mensajes se conservan); no aplica a Gerentes ni a uno mismo.
    - `move_vehicle_to_unit(p_vehicle_id, p_unit_id)` y `move_operator_to_unit(p_operator_id, p_unit_id)`: fallan si el camión u operador está en un viaje en curso (`trip_in_operator_hands`) o comprometido (`vehicle_committing_trip`); mover un operador lo quita de los camiones de otra unidad de negocio.
    - Bajas de camión y operador: el `archived_at` que ya existe (con `fleet_block_archive_with_trips`), ahora solo del Gerente.
  - **App** ("Más → Mi empresa") y **web** (`/transportista/empresa`), con las mismas secciones: Unidades de negocio (crear, renombrar, archivar y ver contenido), Coordinadores (invitar por enlace con la hoja de compartir del sistema, cambiar sus unidades de negocio, dar de baja), Camiones (agrupados por unidad de negocio; mover y dar de baja), Operadores (agrupados; invitar, restablecer acceso, mover y dar de baja) e Invitaciones pendientes (revocar).
  - **Coordinador (operadores de sus unidades de negocio):** en la lista de operadores de la flota (app `operators.tsx` y `operator/[id].tsx`; web `/transportista/flota/operadores`), los botones "Invitar operador" (por enlace, con la hoja de compartir) y "Restablecer acceso", con las RPC de G1b. El selector de unidad de negocio solo ofrece las suyas, y no ve "Mover" ni "Dar de baja" (son del Gerente).
  - **Supervisión:** el inicio del Gerente muestra viajes activos y unidades pendientes de liberar por unidad de negocio (enlaza a `/transportista/viajes?unidad=`).
- **Fuera de alcance:** mover una negociación o un viaje a otra unidad de negocio (Seguimiento); bitácora de acciones del Gerente.
- **RLS:** sin tablas nuevas; las RPC validan `auth_is_manager()` y la empresa.
- **Tests:** pgTAP `32_manager_company.test.sql` (cada RPC: un Coordinador recibe 42501; mover con viaje activo falla; archivar con contenido falla; dar de baja a un Coordinador le quita el acceso al instante). Vitest de agrupación. Playwright `manager-company.spec.ts` (Jorge crea "Bajío", mueve `TT-01` y le asigna a Héctor) y `coordinator-operators.spec.ts` (Héctor invita un operador a "Regional Monterrey", no puede elegir "Corredor MTY–GDL" y le restablece el acceso a Raúl Méndez; el enlace nuevo funciona y el anterior no). Maestro `09-manager-company.yaml`.
- **Aceptación:** todo lo de "Gerente" de producto §3 se puede hacer en web y app; ninguna baja deja un viaje activo sin camión u operador.
- **E2E que probablemente se rompan:** ninguno (agrega flujos).

#### G5 · Cancelación de un viaje que ya salió (D20) 🔒
- **Objetivo:** que la unidad de un viaje cancelado después de salir quede "pendiente de liberar" hasta que su coordinador confirme dónde quedó, y que entonces vuelva a recibir recomendaciones.
- **Depende de:** G10b.
- **Alcance:**
  - **Quién cancela:** sin cambio (B06): Cliente y personal de la unidad de negocio hasta `at_pickup`; el admin hasta `unloading`. Ver Seguimiento.
  - **Motivo estructurado:** enum `trip_cancellation_reason` (`shipper_request`, `carrier_request`, `mechanical_failure`, `accident`, `cargo_issue`, `documentation`, `other`). Columnas `trips.cancellation_reason_code` y `trips.cancelled_by_side` (`shipper`, `carrier` o `admin`). RPC `cancel_trip(p_trip_id, p_reason_code, p_notes)`; la firma vieja `(p_trip_id, p_reason)` queda como envoltura con `other`. Las notas son obligatorias cuando el motivo es `other`.
  - **Tabla `vehicle_release_tasks`:** `id`, `company_id`, `vehicle_id`, `business_unit_id`, `trip_id` (unique), `status` (enum `release_task_status`: `pending`, `released`), `last_known_location`, `last_known_at`, `created_at`, `released_at`, `released_by`, `released_location`, `released_city`, `released_state`, `released_available_from`, `notes`. Índice único `(vehicle_id) where status = 'pending'`.
  - **Trigger `trips_create_release_task`** (after update of status, cuando el viaje pasa a `cancelled` desde un estado posterior a `assigned` y tiene vehículo):
    - Crea la tarea con el último punto de `trip_locations`.
    - Archiva cualquier disponibilidad activa del vehículo (p. ej. la estimada en el destino por `set_trip_vehicle_availability`) con `ended_by_trip_id = null`, para que F5 no la restaure.
    - Usa el bloqueo del vehículo de F5.
    - Antes de la salida no cambia nada: `trips_restore_vehicle_availability` (F5/F13) sigue restaurando.
  - **Mientras está pendiente**, la unidad no recibe disponibilidad ni compromisos: `set_vehicle_availability`, `assign_trip` y `make_offer` con ese vehículo fallan con `55000 vehicle is pending release` (copy "Primero libera la unidad"). `match_pairs` la excluye.
  - RPC `vehicle_release_context(p_task_id)`: último punto, hora y viaje (para precargar el formulario).
  - RPC `release_vehicle(p_task_id, p_available_from, p_latitude, p_longitude, p_city, p_state, p_notes)` (Gerente o `can_operate_unit`). Bloquea tarea → vehículo, marca `released` y escribe la disponibilidad con la fuente nueva `release` (agregarla a `availability_source` en su propia migración). Si el vehículo ya estaba comprometido con otro viaje, la fila queda retenida como en F5. Después, `notify_matches_for_vehicle(vehicle_id)`: las 3 mejores cargas de `match_pairs` como `load_match` al personal de la unidad de negocio.
  - **Notificaciones nuevas:** `vehicle_release_pending` (Gerente y coordinadores de la unidad de negocio) y `vehicle_released`. El operador sigue recibiendo `trip_status_changed`.
  - **UI app y web** (G10b):
    - Diálogo de cancelar con selector de motivo.
    - Etiqueta "Pendiente de liberar" en la lista de camiones y tarjeta "Unidades por liberar (n)" en el inicio.
    - Pantalla de liberar: mapa con la última posición, "¿Dónde está el camión?" (última ubicación, punto en el mapa o ciudad), "¿Desde cuándo está libre?" (ahora por defecto), notas y botón "Liberar unidad".
    - Al liberar, se vuelven a cargar las recomendaciones de esa unidad.
- **Fuera de alcance:** que el transportista cancele con la carga a bordo (Seguimiento); el GPS del camión (D17).
- **RLS:** `vehicle_release_tasks` select por `business_unit_id = any(auth_business_unit_ids())` y admin; escrituras solo por trigger y RPC.
- **Tests:**
  - pgTAP `33_vehicle_release.test.sql`: cancelar después de salir crea la tarea y archiva la estimada; antes de salir, F5 restaura (los tests de `21_unit_availability` siguen verdes); los bloqueos mientras está pendiente; un Coordinador de otra unidad de negocio no libera; liberar escribe disponibilidad `release` y `match_candidates` la ve; notificaciones.
  - Concurrencia: liberar y asignar el mismo vehículo a la vez (patrón de `20_return_trip_concurrency`).
  - Vitest de los motivos y del formulario.
  - Playwright `trip-cancel-release.spec.ts` (el cliente cancela en `en_route_to_pickup`; Andrea libera en la web y vuelve a ver recomendaciones). Maestro `10-coordinator-release.yaml`.
- **Aceptación:** con la seed, el viaje asignado de Fletes Tapatíos (Miguel) sale, el cliente lo cancela, la unidad aparece "Pendiente de liberar", Carmen la libera en Apodaca y la app le recomienda cargas desde ahí.
- **E2E que probablemente se rompan:** pgTAP `09_trips` y `21_unit_availability` (firma de `cancel_trip` y cancelación después de salir), `10_trip_concurrency`; el diálogo de cancelar de `/cliente/viajes/[id]` y su test de UI.
- **Revisión 🔒:** orden de bloqueo (viaje → vehículo → tarea), que la disponibilidad estimada no reviva y que la tarea no se duplique.

#### G6 · Cliente y proveedor: documentos compartidos, alta de proveedor y avisos (D21) 🔒
- **Objetivo:** al aceptar una oferta, el cliente ve los documentos del transportista (y luego los de la unidad y el operador), puede darlo de alta como proveedor, y cada quien recibe los avisos del flujo de JP.
- **Depende de:** G10b (y por ella G3 y G1a).
- **Alcance:**
  - **Tabla `document_shares`:** `id`, `trip_id`, `document_id`, `shipper_company_id`, `carrier_company_id`, `owner_type`, `granted_at`, `granted_reason` (`offer_accepted` o `trip_assigned`), `revoked_at`, `revoked_reason` (`trip_closed`, `trip_cancelled`, `reassigned`, `document_replaced` o `manager_revoked`); `unique (trip_id, document_id)`. Triggers:
    - Viaje creado (`accept_offer`): comparte los documentos de empresa **aprobados**, vigentes y con `shareable_with_shipper`.
    - Asignación o reasignación: comparte los de la unidad y del operador asignados y revoca los anteriores.
    - Viaje cerrado o cancelado: revoca todo.
    - Documento reemplazado: revoca el viejo y, si el viaje sigue abierto, comparte el nuevo en cuanto se aprueba.
  - **Tabla inmutable `document_share_views`:** `share_id`, `viewer_id`, `viewed_at`.
  - RPC `trip_shared_documents(p_trip_id)` (cliente del viaje y admin): lista sin rutas de Storage. RPC `authorize_shared_document_view_service(p_share_id, p_user_id)`, **solo `service_role`**: valida que la comparte esté activa y que el usuario sea del cliente del viaje, registra la consulta y devuelve la ruta.
  - **Edge Function `shared-document-url`** (con JWT; toma el usuario del JWT): llama a la RPC y devuelve una URL firmada de 60 s. El cliente **nunca** recibe permisos de Storage sobre `documents`.
  - El Gerente revoca a mano con `revoke_document_share(p_share_id)`; el personal de la unidad de negocio ve qué se compartió.
  - **Alta de proveedor:** enum `provider_status` (`approved`, `rejected`, `revoked`); tabla `provider_approvals` (PK `(shipper_company_id, carrier_company_id)`, `status`, `notes`, `decided_by`, `decided_at`) y tabla inmutable `provider_approval_events` (historial). RPC `set_provider_status(p_carrier_company_id, p_status, p_notes)`: solo el cliente, y solo si tiene una negociación o un viaje con ese transportista. Sin fila = "Pendiente". En V1 no bloquea nada (D21).
  - **Notificaciones nuevas:**
    - `documents_shared` (al cliente)
    - `provider_status_changed` (Gerente y coordinadores de la unidad de negocio del viaje o negociación más reciente)
    - `trip_document_added` (a la otra parte: el cliente cuando sube el transportista; la unidad de negocio cuando el cliente sube la orden de servicio)
    - Revisar que `load_match` (G1a) llegue solo a coordinadores cuya unidad de negocio tenga un camión **disponible, con documentos listos y compatible**, y al Gerente, sin duplicados por usuario. `trip_assigned` al operador ya existe (B07): verificar que llegue también al operador por teléfono.
  - **Chat interno del viaje** (operador ↔ coordinador): migración sola `alter type conversation_kind add value 'trip_internal'`. En la siguiente, las restricciones de `conversations`: `conversations_subject` admite `trip_internal` con `trip_id` y sin `negotiation_id`, y `conversations_trip_key unique (trip_id)` se reemplaza por `unique (trip_id, kind)` (una conversación por viaje y tipo). `open_conversation` abre las dos con cada viaje y un backfill crea la interna de los viajes existentes. Participan el Gerente, los coordinadores de la unidad de negocio y el operador asignado; el cliente **no** la ve (`is_conversation_participant`). En la app del operador, "Chat con tu coordinador" va primero y "Chat con el cliente" después.
  - **UI web del cliente:** en `/cliente/viajes/[id]`, la sección "Documentos del transportista" (lista y "Ver", que abre la URL firmada). En el comparador de ofertas y en el viaje: "Dar de alta como proveedor", "Rechazar" y "Revocar alta", con la etiqueta "Proveedor aprobado".
  - **UI del transportista** (app y web): estado del alta de proveedor en el viaje y lista de documentos compartidos (el Gerente puede revocar).
- **Fuera de alcance:** que el alta bloquee la asignación (Seguimiento); compartir con terceros (G7).
- **RLS:** `document_shares` select para el cliente del viaje (sin `storage_path`), el personal de la unidad de negocio y admin. `document_share_views`: admin y Gerente. `provider_approvals` y sus eventos: el cliente y la empresa transportista involucrada, y admin. Sin escrituras de clientes.
- **Tests:**
  - pgTAP `34_document_shares.test.sql`: comparte al aceptar, solo aprobados y compartibles, agrega al asignar, revoca al reasignar y al cerrar; el cliente no lee Storage directo; otro cliente no puede; la consulta se registra; falla después de revocar.
  - pgTAP `35_provider_approvals.test.sql` (matriz) y `36_trip_internal_chat.test.sql` (el cliente no lee la conversación interna).
  - Deno de `shared-document-url`.
  - Playwright `shipper-provider.spec.ts`: Ana ve la Constancia de Transportes Regios en su viaje y lo da de alta.
- **Aceptación:** el paso 5–6 del flujo de JP (producto §3) funciona de punta a punta; cada consulta de documento queda registrada.
- **E2E que probablemente se rompan:** pgTAP `11_chat_notifications` y `12_chat_concurrency` (dos conversaciones por viaje); conteos de `seed-tests/seed.test.sql`; la pantalla de chat del operador (Maestro `02`, `05` y `07` si abren el chat).
- **Revisión 🔒:** que no haya acceso a Storage sin bitácora, que se revoque al terminar y que no se compartan identificaciones. Si crece de más: **G6a** (documentos compartidos y alta de proveedor) y **G6b** (notificaciones y chat interno).

#### G7 · Compartir por enlace (D23) 🔒
- **Objetivo:** el coordinador comparte una carga con su equipo, y el cliente comparte una carga o el seguimiento de un viaje con cualquiera, en solo lectura.
- **Depende de:** G10a.
- **Alcance:**
  - Enum `share_link_kind`: `load_internal`, `load_public`, `trip_tracking_public`.
  - Tabla `share_links`: `id`, `kind`, `company_id` (de quien crea), `load_id`, `trip_id`, `token_hash bytea unique` (token de 32 bytes en base64url), `created_by`, `created_at`, `expires_at not null`, `revoked_at`, `last_viewed_at` y `view_count`.
  - RPC:
    - `create_share_link(p_kind, p_load_id, p_trip_id, p_valid_for_hours default null)` → `(id, token, expires_at)`. Vigencia por defecto: interna 72 h, carga pública 7 días, seguimiento hasta 24 h después del cierre; máximo 30 días.
    - Quién crea cada tipo: `load_internal`, el personal que ve la carga (publicada o negociada por su unidad de negocio); `load_public`, el cliente dueño de la carga publicada; `trip_tracking_public`, el cliente del viaje.
    - `revoke_share_link(p_id)`.
    - `open_internal_share(p_token)` (`authenticated`): quien llama debe ser de la empresa que compartió (Gerente, Coordinador u operador). Devuelve el resumen de la carga y `can_offer`.
    - `public_shared_load(p_token)` y `public_shared_trip(p_token)`, otorgadas a `anon`, devuelven JSON saneado:
      - carga: ciudad y estado de origen y destino, ventanas, tipo de carga, peso, tipo de unidad y requisitos;
      - viaje: estado, línea de tiempo (tipos y horas, sin notas), última posición **solo mientras el viaje está activo**, fin estimado de descarga, razón social del transportista, tipo de unidad y placa enmascarada (últimos 3 caracteres);
      - **nunca**: precio, contactos, direcciones exactas, documentos, chat, nombre ni teléfono del operador.
      - Mismo error para un token inválido, vencido o revocado.
  - **Web:**
    - En `/cliente/cargas/[id]` y `/cliente/viajes/[id]`, el botón "Compartir" abre un diálogo con vigencia, "Copiar enlace", los enlaces activos y "Revocar".
    - Página pública `/compartido/[token]`: sin sesión, `noindex`, `Referrer-Policy: no-referrer`, refresco cada 60 s para el seguimiento. Mensaje "Este enlace ya no está disponible" si no sirve.
    - `/transportista/compartido/[token]` para los enlaces internos.
  - **App:** en el detalle de la carga, "Compartir con mi equipo" abre la hoja de compartir del sistema con `https://<sitio>/transportista/compartido/<token>`. El deep link `transport://compartido/<token>` abre la ruta `shared/[token]`, que pide sesión y muestra la carga en solo lectura (el operador también).
  - El middleware de la web deja pasar `/compartido/*` sin sesión.
- **Fuera de alcance:** compartir documentos (G6); enlaces sin vencimiento.
- **RLS:** `share_links` select para la empresa que los creó (sin `token_hash`) y admin; escrituras solo por RPC. `anon` solo ejecuta las dos RPC públicas.
- **Tests:** pgTAP `37_share_links.test.sql`: matriz; un enlace interno abierto por otra empresa falla; vencido y revocado fallan; las llaves del JSON público no incluyen precio, contactos ni direcciones (se comparan con una lista permitida). Vitest de los constructores de enlaces y del saneado. Playwright `share-links.spec.ts`: un visitante anónimo ve el seguimiento sin precio y, al revocar, ve el mensaje.
- **Aceptación:** un enlace de seguimiento funciona sin cuenta y deja de funcionar al revocarse o vencer; nada sensible sale en el JSON.
- **E2E que probablemente se rompan:** los tests del middleware de la web (ruta pública nueva).
- **Revisión 🔒:** entropía y vencimiento del token, que `anon` no pueda llegar a otras RPC, el saneado del JSON y los encabezados.

#### G8 · Suscripción (D24) 🔒 — POSPUESTO
> **Pospuesto por Mateo (2026-10-16).** No se implementa en esta ola: el piloto es gratis. Ningún otro bloque depende de G8 ni debe agregar pantallas o rutas de suscripción. La especificación se conserva para cuando se retome.
>
> **Se retoma como H3 (2026-10-20, D24-E1).** H3 parte de esta especificación; donde difieran, manda H3 (bandera global de piloto, precios "Por definir", la app no vende ni enlaza a la compra y el bloqueo futuro diseñado pero apagado).

- **Objetivo:** que la empresa transportista pague su suscripción con Stripe y, sin claves, todo siga funcionando en "Piloto gratis".
- **Depende de:** G10a.
- **Alcance:**
  - **Modelo:**
    - Enum `subscription_status`: `pilot_free` "Piloto gratis", `active` "Activa", `past_due` "Vencida", `canceled` "Cancelada".
    - `subscription_plans` (datos): `id`, `code` único, `name`, `description`, `amount_cents`, `currency` (check `'MXN'`), `interval` (`month` o `year`), `stripe_price_id`, `audience` (`fleet`, `owner_operator` o `any`), `active` y `sort_order`. La migración no inserta planes: los da de alta el admin por SQL (`docs/release.md`); la seed local trae dos planes demo sin `stripe_price_id`.
    - `company_subscriptions`: PK `company_id` (empresa `carrier`), `status` (por defecto `pilot_free`), `plan_id`, `stripe_customer_id` (unique), `stripe_subscription_id` (unique), `current_period_end`, `cancel_at_period_end`, `pilot_ends_at` (nulo = piloto sin fecha de fin) y `updated_at`. Un trigger la crea con cada empresa transportista; backfill de las existentes.
    - `billing_events`: PK `stripe_event_id`, `type`, `received_at`, `processed_at` y `summary` (solo ids y estados, sin datos personales).
  - **RPC:**
    - `company_billing_state()`: estado, plan, `pilot_ends_at` y nivel de aviso (`none`, `pilot`, `pilot_ending` si faltan ≤ 14 días, `inactive`). Espejo puro `billingNotice(state, now)` en `shared`.
    - `admin_set_pilot_end(p_company_id, p_ends_at)`.
    - `billing_link_customer_service(p_company_id, p_customer_id)` y `billing_apply_event_service(...)`, **solo `service_role`**. La segunda es idempotente: inserta en `billing_events` con `on conflict do nothing` y, si el evento ya estaba, no hace nada.
    - Mapeo de Stripe: `active`/`trialing` → `active`; `past_due`/`unpaid`/`incomplete` → `past_due`; `canceled`/`incomplete_expired` → `canceled`.
  - **Edge Functions** (Deno, `npm:stripe@<versión fija>` con `Stripe.createFetchHttpClient()`):
    - `billing-checkout` (con JWT; solo Gerente): `{ planCode }`. Crea o reutiliza el Customer (metadata `company_id`) y una Checkout Session `mode: 'subscription'` con el `stripe_price_id` del plan, `client_reference_id = company_id`, regreso a `${SITE_URL}/transportista/suscripcion?estado=ok|cancelado` y llave de idempotencia.
    - `billing-portal` (con JWT; solo Gerente): sesión del Customer Portal.
    - `stripe-webhook` (`verify_jwt = false`): verifica `Stripe-Signature` con `STRIPE_WEBHOOK_SECRET` (`constructEventAsync` + `createSubtleCryptoProvider`) sobre el cuerpo crudo y responde 400 si no coincide. Atiende `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid` e `invoice.payment_failed`; lee la suscripción en Stripe para tener el estado real. Un evento repetido responde 200.
    - Sin `STRIPE_SECRET_KEY`, las tres responden `503 { code: 'billing_disabled' }` y la UI muestra "Durante la prueba piloto la plataforma es gratis".
    - **Métodos de pago:** tarjeta. OXXO: verificar en la documentación vigente de Stripe si Checkout lo acepta en modo suscripción; si no, se queda solo con tarjeta y OXXO va a Seguimiento (sería con facturas `send_invoice`).
  - **Gating suave:** sin suscripción activa después del piloto hay banner en la web y la app del transportista ("Tu periodo de prueba terminó…"); **ninguna RPC se bloquea** en V1 (D24).
  - **UI:**
    - Web `/transportista/suscripcion`: estado, planes, "Suscribirme" y "Administrar pago". El Coordinador solo ve el estado.
    - App "Más → Suscripción": estado y "Administrar en la web" (abre `SITE_URL` con `expo-web-browser`). **No se vende dentro de la app** (regla 3.1.1 de App Store; ver Seguimiento).
    - Admin: estado de suscripción y fin del piloto en el detalle de la empresa.
  - **Variables:** `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (secretos de Edge Functions) en `.env.example` y en `docs/release.md` §3.1, con los pasos de Stripe: producto y precio en MXN por plan, endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` con sus eventos y configuración del Portal. No hace falta clave publicable (Checkout redirige).
- **Fuera de alcance:** cobro del flete y comisiones (D08-E1); facturación CFDI de la suscripción (Seguimiento); bloqueo duro.
- **RLS:** `subscription_plans` select de los activos para `authenticated`; `company_subscriptions` select para el personal de la empresa y admin; `billing_events` solo admin. Sin escrituras de clientes.
- **Tests:** pgTAP `38_billing.test.sql` (matriz, idempotencia, RPC de servicio, fila automática por empresa nueva). Deno: webhook con firma válida e inválida (`generateTestHeaderString`), evento duplicado y funciones sin clave. Vitest de `billingNotice`. Playwright `subscription.spec.ts`: sin claves, Jorge ve "Piloto gratis" y la explicación.
- **Aceptación:** en local, sin claves, todas las empresas están en "Piloto gratis"; con claves de prueba de Stripe (manual, documentado), un Gerente se suscribe y el webhook la deja "Activa".
- **E2E que probablemente se rompan:** ninguno.
- **Revisión 🔒:** verificación de firma, idempotencia, que ningún secreto llegue al cliente y que solo el Gerente de la empresa pueda abrir Checkout o el Portal.

#### G9 · Cierre: ubicación precisa, E2E de los cuatro perfiles y revisión final
- **Objetivo:** cumplir D17 en la app del operador y dejar probado y documentado todo §G.
- **Depende de:** todos los bloques G.
- **Alcance:**
  - **D17:** función pura `locationAdvice({ foreground, background, accuracy })` en `shared` → `ok` | `enable_always` | `enable_precise` | `denied`, con Vitest. Banner en el viaje del operador, en el consentimiento y en "Mi viaje" del hombre-camión: "Activa la ubicación precisa y 'Siempre' para que tu coordinador y el cliente vean tu avance", con botón "Abrir ajustes" (`Linking.openSettings()`). La precisión sale del permiso de `expo-location` (`ios.accuracy` `full`/`reduced`; `android.accuracy` `fine`/`coarse`; verificar con la versión instalada).
  - **Playwright:** un recorrido por perfil con la seed nueva: Cliente, Gerente, Coordinador (aislamiento), hombre-camión (web) y anónimo (enlace compartido). Se suman a los de G2–G7.
  - **Maestro:** Gerente, Coordinador, Operador por teléfono y hombre-camión (oferta y opera su propio viaje). Actualizar `apps/mobile/.maestro/README.md` y `scripts/e2e-mobile.mjs`.
  - **Capturas** de web y app en la rama `assets/G9-screenshots`.
  - **Docs:** `docs/demo-local.md` (usuarios demo finales y escenarios), `docs/seguridad.md` (matriz con los roles y tablas nuevas), `docs/tiendas.md` (justificación de ubicación precisa y "Siempre") y `docs/observabilidad.md` (eventos nuevos, si los hay).
  - **Revisión final de consistencia:** que no quede copy "Transportista" donde debe decir Gerente o Coordinador, ni el rol `carrier` en código, ni D06 viejo en textos (`/solo-app`); que `.env.example` y `docs/release.md` estén completos.
- **Aceptación:** `pnpm e2e:mobile` y Playwright pasan con la seed; producto §3 y §6 se cumplen en la demo, **salvo las funciones marcadas como pospuestas** (la suscripción, D24/G8). No se prueban ni se construyen pantallas, rutas, avisos ni notificaciones de suscripción.
- **E2E que probablemente se rompan:** los que aún no se hayan ajustado en los bloques anteriores.

### G.2 Seguimiento (dudas abiertas para Mateo y JP)

Las decisiones de arriba se toman con un valor por defecto para no bloquear; cada una se puede cambiar como dato o en un bloque pequeño:

1. ¿El transportista puede cancelar un viaje **con la carga a bordo** (después de cargar)? Hoy solo el admin puede (G5).
2. ¿El **alta de proveedor** debe bloquear la asignación o la salida para ciertos clientes? En V1 es informativa (G6).
3. ¿Se comparten con el cliente las **identificaciones** (INE del operador o del representante)? Por defecto no, por datos personales (G3/G6).
4. Compatibilidad **licencia ↔ unidad** provisional (B, C y E); que JP la confirme (G3).
5. ¿El operador sigue en el chat del viaje **con el cliente**, o solo en el interno con su coordinador? (G6). → JP (2026-10-20): el operador reporta todo a su coordinador; el chat interno se construye en H1 (D28).
6. ¿El enlace público de seguimiento muestra la placa completa, enmascarada (por defecto) o no la muestra? (G7).
7. Precios de la suscripción, planes (flota y hombre-camión), fecha de fin del piloto, y si la suscripción necesita factura CFDI (G8, pospuesto: se retoma cuando se reactive).
8. ¿OXXO es indispensable para la suscripción? (G8).
9. ¿Los coordinadores también dan de alta camiones, o solo el Gerente? Por defecto, solo el Gerente (G1a/G4).
10. Nombre en la UI para las unidades de negocio: "Unidad de negocio" (por defecto) o "Grupo".
11. ¿Se mueven una negociación o un viaje abiertos entre unidades de negocio? (G4).
12. D18 (borrado de cuenta y chat) y D25 (nombre comercial) siguen pendientes.

---

## §H · Pendientes de JP (2026-10-20)

El 2026-10-20, JP (socio y primer transportista del piloto) respondió cómo trabaja cada perfil, y Mateo pidió construir lo que quedó pendiente. Lo que cambia o se agrega:

- **Operador:** recibe los viajes que le asigna su coordinador **por enlace**, consulta la ruta, comparte su ubicación, sube evidencias y **reporta todo a su coordinador por chat**. Hoy el operador no tiene chat en la app (aunque la RLS lo deja leer el chat del viaje con el cliente).
- **Coordinador:** opera solo su unidad de negocio; busca cargas, negocia, asigna, supervisa, comparte cargas por enlace y chatea con el cliente. Trabaja con monitoristas que tienen el GPS del camión 24/7 (la integración sigue fuera, D17).
- **Gerente y hombre-camión:** pagan la **suscripción**; el piloto es **gratis** (D24 se retoma: D24-E1).
- **"Puntos importantes" de JP:** las **carreteras** por donde transitan los camiones (costo, inseguridad y cercanía) y los **tiempos de espera de descarga** para las predicciones.

Decisiones: [decisiones.md](decisiones.md) (D13-E1, D16-E1, D17-E1, D20-E1, D24-E1 y D28–D32). Producto: cada bloque actualiza la parte de [producto-v1.md](producto-v1.md) que toca (§3, §6 y, en H3, quita las marcas "pospuesto, D24").

Todo §G y el rediseño (U1–U9) ya están en `main`. Cada bloque H es un PR con el ciclo de §0.1, la definición de terminado de §0.3, las reglas comunes de **G.0** (enums en su propia migración, "Same as <bloque>, except …" al recrear funciones, rol literal, autorización en Postgres, notificaciones con copy y ruta, textos en `copy/`, E2E que se rompen son parte del bloque, tamaño) y el gate D14. Además, la UI usa el kit "Transport · Nativo" ([plan-rediseno.md](plan-rediseno.md)) en claro y oscuro, sin valores sueltos (lo exige la prueba de higiene), y cada bloque agrega sus flujos E2E y sus capturas. Rama `v1/<id>-<slug>` (p. ej. `v1/H1-internal-trip-chat`) y título `[H1] Chat interno operador–coordinador`.

### H.0 Reglas comunes de los bloques H

1. **Lo que ya existe y se reutiliza** (no se duplica):
   - Chat (B07, `20261015200000_chat_notifications.sql`): `conversations` (`kind` `negotiation` | `trip`, creadas por el trigger `open_conversation`), `messages` inmutables con adjuntos del bucket privado `chat`, `send_message`, `mark_conversation_read`, `is_conversation_participant` (última versión en G1a.2, `20261026020100_business_unit_policies.sql`) y los `ChatPanel` de la web (`apps/web/src/components/chat/chat-panel.tsx`) y la app (`apps/mobile/src/components/chat-panel.tsx`). Hoy **no hay** aviso (`notification_type`) por mensaje nuevo: el chat se ve por Realtime y no leídos.
   - Enlaces (G1b y G7): `invitations` y `share_links` (token de 32 bytes en base64url, solo se guarda el SHA-256, `share_link_by_token`, vigencia y revocación), las rutas `compartido/[token]` y `shared/[token]` de la app, y `resolveRedirect` (`apps/mobile/src/lib/routing.ts`), que recuerda un enlace abierto sin sesión hasta después del login.
   - Viajes: `assign_trip` (orden de bloqueo de F5: viaje → vehículos por id), `trip_events` con `occurred_at` y ubicación (D11), `estimated_unload_end_at`, `set_trip_vehicle_availability`, liberación de la unidad (G5) y `notify_carrier_staff` (Gerentes + coordinadores de la unidad de negocio).
   - *Matching* (B08): `match_candidates`/`match_pairs`, `packages/shared/src/matching` (puntuación explicable con `MATCHING_WEIGHTS`), la Edge Function `recommendations` y `route_distance_cache`.
   - Datos editables por el admin con bitácora: el patrón de `trip_document_requirements` (G3) con el trigger `audit_admin_action`.
2. **Migraciones:** con marca de tiempo posterior a la última de `main` (hoy `20261031000000_manager_company.sql`). Los bloques de una misma ola se rebasan y renombran como dice G.0.2.
3. **pgTAP:** el siguiente número libre es `42`. Los números de abajo son orientativos; al rebasar, se renumeran sin huecos ni duplicados (como en G6).
4. **Maestro:** el siguiente flujo libre es `15-…`. **Playwright:** un spec por bloque en `e2e/tests/`.
5. **Datos que no conocemos:** ningún bloque inventa precios, tarifas de casetas ni niveles de inseguridad. Si un dato no se puede respaldar con una fuente pública y fechada, queda vacío ("Sin dato" / "Por definir") y la UI lo dice.

### H.1 Olas y dependencias

```
Ola HA   H1 · H3 · H4          (desde main, en paralelo)
Ola HB   H2 (H1) · H5 (H4)
```

| Bloque | Depende de | 🔒 |
|---|---|---|
| H1 · Chat interno operador–coordinador | `main` | Sí |
| H2 · Viaje por enlace al operador | H1 | Sí |
| H3 · Suscripción y pagos (Stripe, MXN) | `main` | Sí |
| H4 · Carreteras: costo, inseguridad y cercanía | `main` | No |
| H5 · Tiempos de espera de carga y descarga | H4 | No |

- **H2 tras H1:** el enlace lleva al operador a su viaje, cuyo canal principal ("Reportar al coordinador") es el chat de H1; las dos tocan la pantalla del operador.
- **H5 tras H4:** las dos cambian `match_candidates`, la Edge Function `recommendations` y la sección "Ruta sugerida" del detalle de la carga; en serie se evitan conflictos.
- **Archivos que tocan varios bloques en paralelo:** `notification_type` (H1, H3), `packages/shared/src/db.ts` (todos: se regenera, no se resuelve a mano) y `supabase/seed.sql`.

---

#### H1 · Chat interno operador–coordinador (D28) 🔒
- **Objetivo:** que cada viaje tenga una conversación **interna del transportista** (operador asignado + coordinadores de la unidad de negocio + Gerente), invisible para el cliente, y que sea el canal principal del operador ("Reportar al coordinador").
- **Depende de:** `main`. Retoma el "Chat interno del viaje" que G6 tenía en su alcance y no construyó.
- **Decisión (D28):** el operador **deja de ver el chat del viaje con el cliente**. Habla con su coordinador, y el coordinador con el cliente (así lo describe JP). Los mensajes que un operador ya escribió en el chat con el cliente se conservan (son inmutables). El hombre-camión sigue viendo el chat con el cliente porque también es Gerente.
- **Alcance:**
  - **Migración 1** (sola): `alter type public.conversation_kind add value 'trip_internal';` y `alter type public.notification_type add value 'internal_message';`.
  - **Migración 2:**
    - `conversations`: `conversations_subject` admite `trip_internal` (con `trip_id` y sin `negotiation_id`); `conversations_trip_key unique (trip_id)` se reemplaza por `unique (trip_id, kind)` (una conversación por viaje y tipo). Las llaves compuestas con las partes del viaje no cambian (`shipper_company_id` se conserva como dato, pero no da acceso a la interna).
    - `open_conversation` ("Same as B07, except …"): con cada viaje nuevo crea las dos conversaciones (`trip` y `trip_internal`). Backfill: la interna de todos los viajes existentes.
    - `is_conversation_participant` ("Same as G1a.2, except …"):
      - `negotiation` y `trip`: cliente del viaje, Gerente y coordinadores de la unidad de negocio, como hoy; **sin** la rama del operador asignado.
      - `trip_internal`: Gerente de la empresa transportista (`auth_fleet_company_id()`), coordinadores con `can_operate_unit` sobre la unidad de negocio del viaje y el operador **actualmente** asignado (`trips.operator_id = auth_operator_id()`). Nunca la empresa cliente. Un operador reasignado deja de verla al instante. Un viaje cerrado o cancelado conserva su conversación interna y se puede seguir escribiendo (como el chat de hoy); así el coordinador confirma con el operador dónde quedó la unidad antes de liberarla (D20-E1).
      - Lo usan `conversations_select`, `messages_select`, `message_reads`, `send_message`, `mark_conversation_read` y las políticas del bucket `chat`, así que adjuntos y fotos funcionan como hoy sin código nuevo.
    - **Aviso por mensaje:** trigger `notify_internal_message` (after insert en `messages` de una conversación `trip_internal`): una notificación `internal_message` a cada participante menos el remitente, con `data` = `{ tripId, conversationId, senderName, preview }` (vista previa de hasta 80 caracteres; "📷 Foto" si solo trae adjuntos). **Agrupación:** si el destinatario ya tiene un `internal_message` sin leer de esa conversación de los últimos 10 minutos, no se crea otro. Solo push y bandeja: `dispatch-notifications` no manda correo de este tipo.
    - RPC `internal_chat_inbox()` (`security invoker`, por RLS): por viaje con conversación interna visible, `trip_id`, ruta, operador, último mensaje y no leídos del que llama. Alimenta la lista de pendientes del coordinador.
  - **Hombre-camión:** si la empresa es `is_owner_operator` y no tiene otro personal, la app y la web **ocultan** el chat interno (sería consigo mismo); la conversación existe igual.
  - **`packages/shared`:** copy de `internal_message` (título "Mensaje de {senderName}", cuerpo con la vista previa) y sus rutas: app del operador → `/trip/chat`, app del transportista → `/trip/<id>?chat=interno`, web → `/transportista/viajes/<id>?chat=interno`; `QUICK_REPORTS` (mensajes rápidos del operador: "Ya llegué a cargar", "Ya llegué a descargar", "Voy con retraso", "Estoy esperando turno", "Tengo un problema en carretera", "Todo en orden") y un helper puro `locationMessage({ lat, lng })` que arma el texto "Mi ubicación: https://maps.google.com/?q=lat,lng".
  - **Ojo, consultas que suponen una conversación por viaje:** `apps/mobile/src/lib/*-api.ts` (el `conversationId` del detalle del viaje) y `apps/web/src/lib/chat/queries.ts` buscan `conversations` por `trip_id`; ahora deben filtrar `kind`.
- **Pantallas:**
  - **App del operador:** en su viaje, botón principal **"Reportar al coordinador"** con contador de no leídos, que abre `(operator)/chat` (el `ChatPanel` de siempre, más los mensajes rápidos en fichas, "Enviar foto" y "Enviar mi ubicación"). El operador ya no ve el chat con el cliente.
  - **App del Gerente y Coordinador:** en `trip/[id]`, el chat con dos pestañas, "Cliente" e "Interno" (la que llegó por la notificación queda abierta); en el inicio, la tarjeta "Mensajes de operadores (n)" con `internal_chat_inbox()`.
  - **Web del transportista:** en `/transportista/viajes/[id]`, las mismas dos pestañas; en `/transportista/viajes`, un distintivo de no leídos del chat interno por viaje.
  - **Web del cliente y admin:** sin cambios. El admin ve las conversaciones internas en el detalle del viaje para disputas (como hoy las demás).
- **Fuera de alcance:** avisos por mensaje del chat con el cliente y de la negociación (Seguimiento); mensajes de sistema automáticos (p. ej. copiar las incidencias al chat interno); notas de voz; un rol de monitorista (D17).
- **Modelo de datos:** sin tablas nuevas (valor de enum, restricciones, trigger y RPC).
- **RLS:** las políticas existentes de `conversations`, `messages`, `message_reads` y Storage `chat` heredan la regla nueva de `is_conversation_participant`. `notifications` sin cambio (cada quien las suyas).
- **Tests:**
  - pgTAP `42_trip_internal_chat.test.sql`: matriz Gerente / Coordinador de la unidad / Coordinador de otra unidad / operador asignado / operador reasignado / cliente del viaje / otra empresa / admin × leer conversación, leer mensajes, `send_message`, `mark_conversation_read`, subir y leer adjuntos del bucket `chat`. El operador ya no lee ni escribe en el chat `trip`. Dos conversaciones por viaje; backfill; agrupación de avisos (dos mensajes seguidos = una notificación; después de leerla, otra).
  - Concurrencia: dos `send_message` simultáneos en la conversación interna generan un solo aviso por destinatario (patrón de `12_chat_concurrency`).
  - Vitest: copy y rutas de `internal_message`, `QUICK_REPORTS`, `locationMessage`.
  - Playwright `trip-internal-chat.spec.ts`: Andrea escribe en "Interno" del viaje de Pedro; Ana (cliente) no ve ese mensaje en `/cliente/viajes/[id]`; Héctor no ve el viaje.
  - Maestro `15-operator-report.yaml`: Pedro abre "Reportar al coordinador", manda "Ya llegué a cargar" y una foto (cámara falsa de E2E), y no hay chat con el cliente en su viaje.
- **Aceptación:** con la seed, Pedro reporta desde la app y Andrea lo ve en la web y en la app con aviso push; el cliente no puede leer la conversación interna ni sus adjuntos por ninguna vía (API, Realtime o Storage).
- **E2E que probablemente se rompan:** pgTAP `11_chat_notifications` y `12_chat_concurrency` (una conversación por viaje; el operador en el chat del cliente), `26_business_units_rls` (matriz de conversaciones), `seed-tests/seed.test.sql` (conteo de conversaciones), Maestro `02`, `05` y `07` (cambia la pantalla del viaje del operador), Vitest de las consultas de chat de web y app.
- **Revisión 🔒:** que ningún camino (Realtime, Storage, `internal_chat_inbox`, notificaciones) filtre la conversación interna al cliente; que el operador reasignado pierda el acceso; que la agrupación de avisos no tenga carreras. Si crece de más: **H1a** (BD, avisos y pgTAP) y **H1b** (pantallas y E2E).

#### H2 · Viaje por enlace al operador (D29) 🔒
- **Objetivo:** que, al asignar, el coordinador mande al operador un enlace (WhatsApp, SMS o lo que elija) que abra la app directo en ese viaje.
- **Depende de:** H1.
- **Alcance:**
  - **Reutiliza `share_links` (G7).** Migración sola: `alter type public.share_link_kind add value 'trip_operator';`. En la siguiente:
    - Columna `share_links.operator_id uuid` (FK a `operators`), obligatoria para `trip_operator` y nula en los demás; `share_links_target` admite `trip_operator` con `trip_id` y `operator_id`.
    - Índice único parcial: un enlace `trip_operator` activo (sin `revoked_at`) por viaje.
    - `company_id` es la empresa transportista del viaje (el personal de la empresa lista y revoca, como en G7).
  - **RPC:**
    - `create_trip_operator_link(p_trip_id)` → `(id, token, expires_at)`. Gerente o coordinador con `can_operate_unit(trip.business_unit_id)`; el viaje debe tener operador asignado y estar entre `assigned` y `unloading`. Reemitir revoca el anterior. Vence a los 30 días (el máximo de G7) o antes, al terminar el viaje. Pasa por `consume_rate_limit('create_share_link')`. Bloquea el viaje (mismo orden que `assign_trip`).
    - `open_trip_operator_link(p_token)` (`authenticated`, con límite de frecuencia): devuelve `{ tripId, target }`:
      - `target = 'operator'` si quien llama es el operador del enlace **y** sigue asignado al viaje;
      - `target = 'carrier'` si es Gerente o coordinador de la unidad de negocio (lo manda a su detalle del viaje);
      - cualquier otro caso (token desconocido, vencido, revocado, viaje cerrado o cancelado, otro operador, otra empresa, cliente): el mismo error `22023 invalid or expired link`, sin ids.
      - Actualiza `last_viewed_at` y `view_count`.
    - `revoke_share_link` (G7) sirve también para este tipo.
  - **Vencimiento automático:** trigger en `trips` (after update de `status` u `operator_id`): al pasar a `closed` o `cancelled`, o al cambiar de operador, revoca el enlace activo del viaje.
  - **`packages/shared`:** `tripLinkUrl(siteUrl, token)` → `https://<sitio>/viaje/<token>`, `tripDeepLink(token)` → `transport://viaje/<token>`, `parseTripLink(url)` y `tripLinkMessage({ operatorName, route, url })` (texto en `copy/` para el mensaje: "Hola {nombre}, tienes un viaje asignado: {ruta}. Ábrelo en la app: {url}").
  - **Web `/viaje/[token]`** (pública, `noindex`, `Referrer-Policy: no-referrer`, el middleware la deja pasar sin sesión): **no consulta el token ni muestra datos del viaje**. Muestra "Abre este viaje en la app de Transport" con el botón "Abrir en la app" (`transport://viaje/<token>`), los botones de las tiendas (de `NEXT_PUBLIC_IOS_APP_URL` y `NEXT_PUBLIC_ANDROID_APP_URL`; si faltan, no se muestran) y "Entra con tu teléfono y contraseña".
  - **Enlaces universales (opcionales):** la web sirve `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` solo para `/viaje/*`, a partir de `APPLE_TEAM_ID` y `ANDROID_CERT_SHA256` (si faltan, responde 404 y todo sigue funcionando con el botón). La app declara `associatedDomains` e `intentFilters` desde `EXPO_PUBLIC_SITE_URL` en `app.config` solo cuando hay valor. Requiere una build nueva: avisarlo en el PR.
  - **App:** ruta `viaje/[token]` (deep link y enlace universal):
    - Sin sesión, `resolveRedirect` recuerda el enlace (extender `SHARED_PATH` a `/viaje/<token>`), pide el login y después vuelve.
    - Con sesión: `open_trip_operator_link`; el operador va a su viaje (si no es el viaje en curso, lo ve como "Siguiente viaje" en solo lectura hasta que le toque); el personal va a `trip/[id]`. Error: "Este enlace ya no está disponible. Pide uno nuevo a tu coordinador."
  - **Envío (app y web del transportista):** después de `assign_trip`, y en el detalle del viaje mientras esté activo, "Enviar viaje al operador":
    - App: hoja de compartir del sistema con `tripLinkMessage`.
    - Web: "Enviar por WhatsApp" (`https://wa.me/<teléfono del operador sin +>?text=…`), "Enviar por SMS" (`sms:` con el cuerpo), "Copiar enlace" y "Revocar".
  - El aviso `trip_assigned` (push) se queda: el enlace es para quien no tiene la notificación a la mano o usa otro teléfono.
- **Fuera de alcance:** que el enlace sirva sin sesión o cree la cuenta del operador (eso es la invitación de G1b/G2); acortar enlaces.
- **Modelo de datos:** columna `operator_id` y valor de enum en `share_links`; sin tablas nuevas.
- **RLS:** `share_links` sin cambio (select para la empresa que lo creó, sin `token_hash`; escrituras por RPC). `anon` no ejecuta las RPC nuevas.
- **Tests:**
  - pgTAP `43_trip_operator_links.test.sql`: quién crea (Gerente, Coordinador de la unidad; no el de otra unidad, ni el operador, ni el cliente); `open` por el operador asignado → `operator`; por el Coordinador → `carrier`; por otro operador de la empresa, otra empresa, el cliente o `anon` → mismo error; reemitir revoca el anterior; reasignar, cerrar o cancelar revoca; vencido falla.
  - Concurrencia: crear el enlace y reasignar el operador a la vez (patrón de `10_trip_concurrency`).
  - Vitest: constructores y parser de enlaces, mensaje, `resolveRedirect` con `/viaje/<token>`.
  - Playwright `trip-operator-link.spec.ts`: Andrea asigna y obtiene el enlace (WhatsApp con el teléfono de Pedro); un visitante anónimo de `/viaje/<token>` ve solo "Abrir en la app", sin datos del viaje.
  - Maestro `16-operator-trip-link.yaml`: con la app cerrada y sin sesión, `openLink transport://viaje/<token>` → login de Pedro → su viaje; con un token revocado, el mensaje de error.
- **Aceptación:** el coordinador asigna y en dos toques le manda el viaje a su operador por WhatsApp; el operador abre el enlace y llega a su viaje (con o sin sesión); nadie más llega a ese viaje con el enlace.
- **E2E que probablemente se rompan:** tests del middleware de la web (ruta pública nueva) y de `routing.test.ts` de la app; `37_share_links` (nuevo tipo y columna en la matriz).
- **Revisión 🔒:** entropía y vencimiento del token, que la página pública no consulte ni revele nada, que el enlace no dé acceso a quien no es el operador asignado o el personal de la unidad, y orden de bloqueo.

#### H3 · Suscripción y pagos (Stripe, MXN) (D24-E1, D30) 🔒
- **Objetivo:** que la empresa transportista (su Gerente, o el hombre-camión) pueda pagar su suscripción con Stripe cuando termine el piloto, y que mientras dure el piloto todo sea gratis y nada falle, con o sin claves de Stripe.
- **Depende de:** `main`. **Parte de la especificación de G8** (modelo, RPC de servicio, Edge Functions, verificación de firma, idempotencia y mapeo de estados); aquí solo se anota lo que cambia o se agrega. Donde difieran, manda H3.
- **Alcance:**
  - **Bandera global de piloto.** Tabla `platform_settings` (`key text` PK, `value jsonb not null`, `description`, `updated_by`, `updated_at`), editable solo por el admin y con bitácora (`audit_admin_action`), legible por `authenticated` (no guarda secretos). Llaves que crea la migración:
    - `billing.pilot_mode` = `true` (**activa por defecto**): todas las empresas en "Piloto gratis", sin Checkout ni bloqueos.
    - `billing.pilot_ends_at` = `null` (sin fecha).
    - `billing.enforcement` = `"off"` (`off` | `notice` | `block`): qué pasa sin suscripción activa **cuando el piloto termina**. `off` y `notice` no bloquean nada; `block` es el bloqueo futuro (diseñado y probado, apagado).
  - **Planes por tipo** (`subscription_plans` de G8) con:
    - `audience` `fleet` | `owner_operator`;
    - `amount_cents` **nulo = "Por definir"**;
    - `stripe_price_id` nulo = no se puede contratar.
    - La migración crea dos planes sin precio: `owner_operator_monthly` ("Hombre camión") y `fleet_monthly` ("Empresa transportista"). El admin edita nombre, descripción, precio, `stripe_price_id` y `active` en la web (con bitácora). Un plan solo se ofrece con precio, `stripe_price_id` y `active`.
  - **Estado por empresa:** `company_subscriptions` y `billing_events` como en G8 (fila automática por empresa transportista y backfill).
  - **Estado efectivo:** `company_billing_state()` devuelve `effective_status`:
    - `pilot_free` mientras `pilot_mode` esté activa (aunque la empresa tenga otra cosa guardada);
    - si no, el estado de la empresa (`active`, `past_due`, `canceled` o `none`);
    - además: el plan, `pilot_ends_at`, `notice` (`none`, `pilot`, `pilot_ending` si faltan ≤ 14 días, `inactive`), `checkout_available` y `billing_configured`.
    - Espejo puro `billingState(settings, subscription, now)` en `shared`, con Vitest.
  - **Bloqueo futuro, apagado:**
    - `assert_billing_allows(p_company_id)` (interna, `security definer`): no hace nada salvo con `pilot_mode = false`, `enforcement = 'block'` y la empresa sin suscripción `active`; entonces, error `P0001 subscription required` (copy "Tu suscripción no está activa. El Gerente puede reactivarla en la web").
    - Se llama **solo** al iniciar trabajo nuevo: `make_offer` ("Same as …, except") y `set_vehicle_availability`.
    - **Nunca** bloquea viajes en curso, ubicación, evidencias, chat, cancelación ni documentos.
  - **Edge Functions** (las tres de G8: `billing-checkout`, `billing-portal`, `stripe-webhook`):
    - Sin `STRIPE_SECRET_KEY` responden `503 { code: 'billing_disabled' }`.
    - `billing-checkout` además responde `409 { code: 'pilot_active' }` mientras dure el piloto.
    - El webhook verifica la firma con `STRIPE_WEBHOOK_SECRET` sobre el cuerpo crudo, es idempotente (`billing_events`) y lee la suscripción en Stripe para tener el estado real; también funciona durante el piloto (guarda el estado, aunque el efectivo siga siendo "Piloto gratis").
    - Fijar la versión de `npm:stripe` y de la API de Stripe.
  - **UI:**
    - **Web del Gerente** `/transportista/suscripcion`:
      - En piloto: "Piloto gratis" con la explicación ("Durante la prueba piloto la plataforma es gratis. Te avisaremos antes de que termine") y los planes en solo lectura ("Por definir").
      - Después del piloto: "Suscribirme" (Checkout) y "Administrar pago" (Customer Portal), y la vuelta con `?estado=ok|cancelado`.
      - El Coordinador solo ve el estado.
    - **App** ("Más → Suscripción"), Gerente y hombre-camión: estado, plan y avisos, en **solo información**. Por las reglas de las tiendas (App Store 3.1.1 y 3.1.3; la política de pagos de Google Play), la app **no vende, no muestra precios para contratar ni tiene botones o enlaces a la compra**: muestra el texto "La suscripción se administra desde la web de Transport" (sin enlace). Documentarlo en `docs/tiendas.md` (D30).
    - **Avisos:** banner en la web y la app del transportista cuando `notice` es `pilot_ending` o `inactive` (con `enforcement = 'off'` no aparece `inactive`).
    - **Admin:** `/admin/suscripciones` con la bandera de piloto, la fecha de fin, el modo de bloqueo (con confirmación), los planes y el estado por empresa; en el detalle de la empresa, su estado.
  - **Variables:** `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (secretos de Edge Functions) en `.env.example` y `docs/release.md` §3.1 con los pasos de Stripe de G8. No se crean cuentas ni productos de Stripe.
  - **Producto:** quitar las marcas "pospuesto, D24" de `producto-v1.md` (§2, §3, §4 y §6) y describir el piloto gratis.
- **Fuera de alcance:** cobro del flete y comisiones (D08-E1); factura CFDI de la suscripción; OXXO y transferencia; precio por camión o por usuario; cupones; activar el bloqueo (es un cambio de dato que decide Mateo).
- **Modelo de datos:** `platform_settings`, `subscription_plans`, `company_subscriptions`, `billing_events` (columnas de G8, con `amount_cents` nulo).
- **RLS:**
  - `platform_settings`: select para `authenticated`; escritura solo admin (RPC `admin_set_platform_setting(p_key, p_value)` con validación por llave).
  - `subscription_plans`: select de los activos para `authenticated`; todos para admin; escritura solo admin.
  - `company_subscriptions`: select para el personal de la empresa y admin. `billing_events`: solo admin.
  - Sin escrituras de clientes; las de Stripe, solo por RPC `*_service` con *service role*.
- **Tests:**
  - pgTAP `44_billing.test.sql`: matriz; fila por empresa nueva; `company_billing_state` en piloto, después del piloto con cada estado y con `pilot_ends_at`; idempotencia de `billing_apply_event_service`; que solo `service_role` llama las RPC de servicio; `assert_billing_allows` no bloquea con piloto ni con `off`/`notice`, bloquea `make_offer` con `block` y nunca bloquea `record_trip_event`, `send_message` ni `cancel_trip`.
  - Deno: firma válida e inválida (`generateTestHeaderString`), evento repetido, sin claves (503), piloto activo (409), solo el Gerente de la empresa abre Checkout o el Portal.
  - Vitest: `billingState`, formato "Por definir" del precio y copy.
  - Playwright `subscription.spec.ts`: sin claves, Jorge ve "Piloto gratis" y los planes "Por definir"; Andrea solo ve el estado; el admin cambia la fecha de fin y Jorge ve el aviso `pilot_ending`.
  - Maestro `17-manager-subscription.yaml`: José (hombre-camión) ve "Piloto gratis" y no hay botón de compra.
- **Aceptación:** con la seed y sin claves, todas las empresas están en "Piloto gratis" y ninguna función cambia; con claves de prueba de Stripe (manual, documentado) y el piloto apagado, un Gerente se suscribe y el webhook la deja "Activa".
- **E2E que probablemente se rompan:** pgTAP de `make_offer` y `set_vehicle_availability` si cambian sus firmas (no deben cambiar), `security_matrix.test.sql` (tablas nuevas), el menú "Más" de la app (Maestro `09`).
- **Revisión 🔒:** verificación de firma sobre el cuerpo crudo, idempotencia y orden de eventos, que ningún secreto llegue al cliente, que solo el Gerente de la empresa abra Checkout o el Portal, que la bandera de piloto no se pueda cambiar fuera del admin y que el bloqueo apagado no toque ninguna RPC de viaje en curso.

#### H4 · Carreteras: costo, inseguridad y cercanía (D31)
- **Objetivo:** que la recomendación y el detalle de una carga digan **por dónde** conviene ir, cuánto cuestan las casetas (estimado) y si hay tramos inseguros a la hora en que pasaría el camión, respetando los tramos que el transportista prefiere o evita.
- **Depende de:** `main`.
- **Alcance:**
  - **Catálogo** (datos editables por el admin, con bitácora; reutiliza el patrón de G3):
    - Enum `road_data_status` (`estimated`, `verified`) y enum `road_risk_level` (`low`, `medium`, `high`).
    - Enum `toll_vehicle_class` con las clases de camión de las tarifas de casetas: `c2` … `c9` (camión de 2 a 9 ejes).
    - `road_segments`: `id`, `code` único, `name` ("Saltillo – San Luis Potosí"), `highway` (texto, p. ej. "57D"), `from_city`/`from_state`/`from_lat`/`from_lng`, `to_city`/`to_state`/`to_lat`/`to_lng`, `distance_km`, `is_toll`, `notes`, `source`, `source_url`, `source_date`, `data_status`, `archived_at`.
    - `road_segment_tolls`: `segment_id`, `vehicle_class`, `amount_cents` (nulo = "Sin dato"), `source`, `source_url`, `valid_from`, `data_status`; PK `(segment_id, vehicle_class, valid_from)`.
    - `road_segment_risks`: `id`, `segment_id`, `level`, `from_hour`/`to_hour` (0–24 en `America/Mexico_City`; si `from_hour > to_hour`, cruza la medianoche; 0–24 = todo el día), `description` (p. ej. "robo a transporte de carga"), `source`, `source_url`, `observed_on`, `data_status`, `archived_at`.
    - `road_corridors`: `id`, `code`, `name` ("MTY–GDL por Saltillo y San Luis Potosí"), origen y destino (ciudad, estado, punto y `radius_km`, p. ej. 60 km para la zona metropolitana), `bidirectional` (por defecto `true`), `archived_at`. `road_corridor_segments`: `corridor_id`, `seq`, `segment_id`.
  - **Ejes del camión:** columna `vehicles.axle_count smallint` (2–9, nula). Si es nula, el valor por defecto sale de una función pura `defaultAxleCount(kind, unitType)`: tractocamión 5 (T3S2), torton 3, rabón 2, 3.5 t 2; editable en el formulario de la unidad.
  - **Preferencias del transportista:**
    - Tabla `carrier_road_preferences`: `id`, `company_id`, `carrier_route_id` (nulo = todas sus rutas), `segment_id`, `preference` (enum `road_preference`: `prefer`, `avoid`), `notes`, `created_by`, `created_at`, `archived_at`; único activo por `(company_id, coalesce(carrier_route_id, …), segment_id)`.
    - La leen y escriben Gerente y Coordinador, como `carrier_routes` (`auth_carrier_company_id()`).
  - **Lógica pura** en `packages/shared/src/roads/` (Vitest):
    - `suggestRoute({ origin, destination, departAt, axleCount, corridors, preferences })`:
      - Corredores cuyo origen y destino caen en sus radios (en cualquier sentido si `bidirectional`).
      - Descarta los que usan un tramo `avoid` (si todos lo usan, elige el mejor y lo marca).
      - Ordena por `tolls + riskPenalty − preferredBonus`.
      - Devuelve el corredor, los tramos con hora estimada de paso (`departAt` + km acumulados / `ESTIMATED_TRUCK_SPEED_KMH`), el total de casetas para la clase del camión (y si falta algún dato), los avisos de riesgo **en la franja horaria** de paso y `source: 'catalog' | 'none'`.
    - `tollClassFor(axleCount)` y el copy de avisos ("Tramo con riesgo alto de noche: …").
  - **RPC:**
    - `road_catalog()` (`stable`, `authenticated`): corredores activos con tramos, casetas vigentes y riesgos; datos de referencia, sin datos de empresas.
    - Las preferencias se leen por RLS.
    - CRUD del admin por RPC (`admin_upsert_road_segment`, `admin_set_segment_toll`, `admin_upsert_segment_risk`, `admin_upsert_corridor`) con validación y bitácora.
  - **Recomendaciones:**
    - La Edge Function `recommendations` carga el catálogo (en memoria por invocación) y las preferencias del que llama, y agrega `road` a cada recomendación (`suggestRoute` desde el punto de carga, a la hora de inicio de la ventana de recolección).
    - Pesos nuevos en `MATCHING_WEIGHTS` (con defaults en `DEFAULT_MATCHING_WEIGHTS`):
      - `tolls` (0–1, por defecto 1): resta las casetas estimadas del precio en `pricePerKm`;
      - `highRisk` (puntos por tramo de riesgo alto en su franja, por defecto 5).
    - El desglose explica las dos cosas. El respaldo local de la app y de la web usa la misma función.
  - **Pantallas:**
    - **Detalle de la carga** (app `load/[id]` y web `/transportista/cargas/[id]`): sección "Ruta sugerida" con el corredor y sus tramos, "Casetas estimadas: $X" (con "estimado · fuente, fecha"), los avisos de riesgo y, si no hay corredor, "Sin ruta en el catálogo".
    - **Tarjetas de recomendación:** "Casetas ~$X" y un ícono de aviso si hay riesgo alto.
    - **Rutas habituales** (app `routes.tsx` y web `/transportista/rutas`): por ruta, "Tramos preferidos" y "Tramos a evitar" (selector con los tramos del catálogo cercanos a la ruta).
    - **Admin** `/admin/carreteras`: tramos, casetas por clase, riesgos y corredores, con su fuente y fecha obligatorias.
    - El cliente no ve nada de esto en V1.
  - **Datos semilla del corredor piloto** (migración de datos, para que existan también en producción, todos con `data_status = 'estimated'`):
    - Corredores MTY ↔ GDL: el principal por Saltillo y San Luis Potosí, y al menos una alternativa (p. ej. por Zacatecas y Aguascalientes), con sus tramos.
    - Tarifas de caseta por clase tomadas de tarifas **publicadas** por los operadores de las autopistas (CAPUFE u otros), con `source_url` y fecha de consulta.
    - Riesgos con fuentes públicas fechadas (p. ej. estadística oficial de robo a transportista del SESNSP o reportes de cámaras del sector).
    - **Lo que no se pueda respaldar con fuente queda nulo** ("Sin dato"); no se inventan cifras (H.0.5). JP revisa y corrige como admin.
- **Fuera de alcance:** trazar la ruta con la API de Google (casetas de Routes API, polilíneas por corredor) y calcular la ruta real por GPS; desvíos en vivo; catálogo nacional; riesgo por evento (bloqueos y noticias). Van a Seguimiento.
- **RLS:**
  - Catálogo (`road_*`): select para `authenticated` (los archivados solo para admin); escritura solo admin, por RPC y con bitácora.
  - `carrier_road_preferences`: select, insert y update para el personal de su empresa (`auth_carrier_company_id()`) y admin; sin delete (se archiva).
- **Tests:**
  - pgTAP `45_road_intelligence.test.sql`: matriz del catálogo y de las preferencias (otra empresa no ve ni escribe las tuyas; un operador y un cliente no escriben); bitácora de los cambios del admin; validaciones (horas, clases, fuente obligatoria); `road_catalog` no devuelve archivados; la seed del corredor piloto existe.
  - Vitest: `suggestRoute` (radios, sentido, tramos evitados y preferidos, franjas que cruzan la medianoche, datos faltantes), `defaultAxleCount`, el efecto de los pesos nuevos en la puntuación.
  - Deno: `recommendations` devuelve `road` y funciona sin catálogo (`source: 'none'`).
  - Playwright `road-intelligence.spec.ts`: Andrea ve "Ruta sugerida" y "Casetas estimadas" en la carga MTY → GDL; marca "evitar" un tramo en sus rutas y la ruta sugerida cambia a la alternativa.
  - Maestro `18-carrier-road.yaml`: la tarjeta de recomendación muestra las casetas y el detalle, la ruta.
- **Aceptación:** con la seed, la recomendación MTY ↔ GDL muestra la ruta sugerida, sus casetas estimadas con fuente y los avisos de riesgo por hora; el admin corrige una tarifa y se refleja; sin catálogo, nada falla.
- **E2E que probablemente se rompan:** `carrier-web-offer.spec.ts` y `return-trip.spec.ts` si el orden de las recomendaciones cambia con el peso `tolls` (verificar con la seed; si cambia, ajustar la seed o el peso por defecto, no la intención de la prueba); Vitest de `matching` (desglose nuevo); `security_matrix.test.sql`.

#### H5 · Tiempos de espera de carga y descarga (D32)
- **Objetivo:** medir cuánto esperan de verdad los camiones en cada sitio de carga y descarga, y usarlo en el fin estimado del viaje, en la recomendación de regresos y como dato para el cliente.
- **Depende de:** H4.
- **Alcance:**
  - **Medición** (de los eventos de D11, sin captura nueva):
    - Enum `trip_stop` (`pickup`, `delivery`). Tabla derivada `trip_stop_dwells`, PK `(trip_id, stop)`:
      - `shipper_company_id`, `carrier_company_id`;
      - `site_lat`/`site_lng` del punto de la carga, redondeados a 3 decimales (~100 m: el "sitio");
      - `arrived_at`, `handling_started_at`, `handling_finished_at`;
      - `wait_minutes` y `handling_minutes` (generadas);
      - `hour_band` (`night` 0–6, `morning` 6–12, `afternoon` 12–18, `evening` 18–24, en `America/Mexico_City`, por la llegada) y `excluded` (negativos, o espera de más de 72 h).
    - La escribe solo el trigger `trip_events_record_dwell` (after insert en `trip_events`: `arrived_at_pickup`/`loading_started`/`loading_finished` y `arrived_at_delivery`/`unloading_started`/`unloading_finished`, con su `occurred_at`; un evento offline que llega tarde también cuenta). Backfill con los viajes existentes.
  - **Agregado:** `site_dwell_estimate(p_stop, p_lat, p_lng, p_shipper_company_id default null, p_at default now())` (`stable security definer`):
    - Devuelve mediana y p75 de espera y de maniobra, `sample_size` y `basis`.
    - Escalones de `basis`, el primero con ≥ 5 mediciones válidas: mismo sitio y franja horaria → mismo sitio → mismo cliente (todas sus instalaciones) → `default`.
    - **Privacidad:** una estadística con mediciones de otras empresas transportistas solo se devuelve si viene de ≥ 2 empresas distintas; si no, solo cuentan las del que llama. El cliente ve las de sus propios sitios.
    - **Valor por defecto:** el actual de la app (4 h de descarga, `DEFAULT_UNLOAD_HOURS` en `trip-forms.tsx`), que pasa a `packages/shared` como `DEFAULT_DWELL_MINUTES = { pickup: 240, delivery: 240 }` (carga y descarga, incluida la espera). La respuesta dice que es el valor por defecto.
  - **Lógica pura** en `packages/shared/src/dwell.ts` (Vitest), espejo del SQL:
    - `hourBand(date)`, `median`/`percentile`;
    - `dwellEstimate(samples, { minSamples, defaults })` con los mismos escalones;
    - `estimatedStopEnd({ arrivedAt, handlingStartedAt, estimate })`;
    - `formatDwell` (copy: "~6 h de espera (12 viajes)", "~4 h (valor por defecto)").
  - **Dónde se usa:**
    1. **Operador al iniciar la descarga:** el fin estimado sugerido sale del estimado del sitio y no del fijo de 4 h (el operador lo puede cambiar, como hoy).
    2. **Fin estimado del viaje antes de descargar:** RPC `trip_estimated_end(p_trip_id)` = llegada al destino (o, antes de llegar, la hora estimada de llegada con `route_distance_cache`/estimado de H4) + espera + maniobra. Se muestra en el detalle del viaje del transportista y del cliente ("Fin estimado de descarga: 18:30 · según 12 viajes en este sitio"). Una vez iniciada la descarga, manda el `estimated_unload_end_at` del operador.
    3. **Regresos:** `match_candidates` ("Same as …, except") usa, cuando no hay `estimated_unload_end_at`, `trip_estimated_end` en vez de `delivery_window_end` para el `available_from` del modo regreso. La tarjeta del regreso dice "Espera típica en descarga: ~6 h" y el detalle de la carga, "Espera típica al cargar: ~2 h" (sección "Ruta sugerida" de H4).
    4. **Cliente:** en `/cliente/viajes/[id]` y en el detalle de su carga, "Tiempo típico en tu sitio" de carga y de descarga.
- **Fuera de alcance:** predicción con IA (§5); pedir al operador datos nuevos (turno, andén); catálogo de instalaciones con nombre (el sitio es el punto redondeado); avisar al cliente que su sitio es lento.
- **Modelo de datos:** `trip_stop_dwells` (derivada; inmutable para clientes).
- **RLS:** `trip_stop_dwells`: select para el personal de la unidad de negocio del viaje (`can_operate_unit`), el cliente del viaje y admin; escrituras solo por el trigger. Los agregados entre empresas salen **solo** por `site_dwell_estimate` y `trip_estimated_end`, que aplican la regla de privacidad.
- **Tests:**
  - pgTAP `46_site_dwell.test.sql`: el trigger mide carga y descarga (incluido un evento offline que llega tarde); excluye los atípicos; escalones de `site_dwell_estimate` y su valor por defecto; la regla de ≥ 2 empresas; matriz de `trip_stop_dwells`; `match_candidates` usa el estimado para el regreso; los tests de `21_unit_availability` siguen verdes.
  - Vitest: `dwellEstimate` (mismos casos que el pgTAP), `hourBand` en la zona horaria de México, `formatDwell`.
  - Playwright `site-dwell.spec.ts`: con la seed (que agrega viajes cerrados con tiempos en el sitio de GDL), el regreso GDL → MTY de Andrea dice "Espera típica en descarga" y Ana ve el tiempo típico de su sitio.
  - Maestro `19-operator-unload-estimate.yaml`: al iniciar la descarga, el fin sugerido sale del sitio.
- **Aceptación:** con datos suficientes, el fin estimado y los regresos usan los tiempos medidos y dicen en cuántos viajes se basan; con pocos datos, usan las 4 h de siempre y lo dicen; ninguna empresa ve los tiempos de otra por debajo del umbral.
- **E2E que probablemente se rompan:** `return-trip.spec.ts` (la hora de disponibilidad del regreso puede cambiar), Maestro `02-operator-unloading` (fin sugerido), pgTAP `14_matching` y `21_unit_availability`, conteos de `seed-tests/seed.test.sql`.

### H.2 Seguimiento (dudas abiertas para Mateo y JP)

Cada bloque arranca con el valor por defecto de abajo; cambiarlo es un dato o un bloque pequeño:

1. **Chat del operador con el cliente:** por defecto, el operador no lo ve (D28). ¿JP lo confirma?
2. **Avisos de mensajes del chat con el cliente y de la negociación:** hoy no existen; H1 solo los agrega para el chat interno.
3. **Monitoristas:** ¿se les da acceso (rol de solo lectura del viaje y del chat interno) mientras llega la integración de GPS (D17)?
4. **Precios y planes** de la suscripción (¿por empresa, por camión o por usuario?), fecha de fin del piloto, factura CFDI y OXXO (H3).
5. **Tiendas:** ¿se puede mencionar o enlazar la web de pago desde la app? Por defecto no (D30).
6. **Corredores y fuentes:** qué corredores y tramos usa la flota de JP además del principal MTY–GDL, y qué fuentes de inseguridad consulta; ¿quién mantiene el catálogo?
7. **Tiempos de espera para el cliente:** ¿se le muestran también las estadísticas generales (otras empresas) de su sitio, o solo las de sus viajes?
8. **Enlaces universales:** dominio definitivo, Apple Team ID y huella del certificado de Android (H2).
