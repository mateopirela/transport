# Plan de implementación: V1

> Qué construimos: [producto-v1.md](producto-v1.md). Por qué lo hacemos así: [decisiones.md](decisiones.md).
> Este plan lo va a ejecutar un **workflow dinámico de agentes**. Cada **bloque es un PR** que revisan CI y Greptile antes del merge.

---

## 0. Cómo se ejecuta este plan

### 0.1 Ciclo de vida de cada bloque

```
plan (este doc) ─▶ rama v1/<id>-<slug> ─▶ implementación + tests ─▶ checks locales
     ─▶ push + PR (plantilla) ─▶ CI ─▶ revisión de Greptile ─▶ corrección de hallazgos (máx. 3 rondas)
     ─▶ gate de merge (D14) ─▶ merge a main ─▶ desbloquea los bloques dependientes
```

- **Rama:** `v1/B07-chat-schema`. **Título del PR:** `[B07] Chat y notificaciones: esquema`.
- **Tamaño objetivo:** menos de ~800 líneas cambiadas por PR, sin contar archivos generados ni lockfiles. Si un bloque crece de más, se divide en `B07a`/`B07b`.
- **Un bloque solo toca su alcance.** Si encuentra algo fuera de alcance, lo anota en la sección "Seguimiento" del PR y no lo arregla ahí.
- **Revisión de Greptile:** usa la app de GitHub sobre el PR, o el CLI (`greptile:review`) sobre la rama. El agente debe responder **cada** comentario: lo corrige o explica por qué no aplica. Un hallazgo de severidad alta sin resolver bloquea el merge.
- **Gate de merge (D14, pendiente):**
  - Opción A, aprobación humana: Mateo aprueba cada PR.
  - Opción B, auto-merge: si CI está verde y Greptile no deja hallazgos sin resolver, se hace merge solo. En los bloques marcados 🔒 siempre aprueba un humano.

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
- [ ] Greptile no deja hallazgos sin resolver.

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
│  ├─ web/          Next.js (App Router) + Tailwind + shadcn/ui  → Cliente y Admin
│  └─ mobile/       Expo (Expo Router, dev build con EAS)        → Transportista y Operador
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
  - `vehicles`, `operators`, `operator_invitations` (código o enlace de un solo uso con expiración), `carrier_routes` y `vehicle_availability`.
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
  - Login, registro de transportista y "unirme con invitación" para operadores.
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
| Docker Desktop, Node LTS, pnpm, Supabase CLI y GitHub CLI en la máquina | B00 y B01 | Mateo |
| Greptile instalado en el repo `mateopirela/transport` (app de GitHub) o CLI autenticado | Todos | Mateo |
| Decidir D14 (gate de merge) y D15 (acceso de operadores) | B00, B04 y B17 | Mateo + JP |
| Cuenta de Expo/EAS | B17 | Mateo |
| Clave de Google Maps Platform con facturación (Places, Maps JS, Maps SDK y Routes) | B08, B13 y B19 | Mateo |
| Lista oficial de documentos por perfil (D16) | Reemplaza la seed de B03; no bloquea | JP |
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

Predicción de fin de descarga con los datos de `trip_events`; comparación de fotos con IA; pagos dentro de la plataforma, comisiones y suscripciones; emisión y validación de Carta Porte; integración con GPS de flotas; calificaciones y reputación; app de cliente en móvil y transportista en web; inglés; hardware propio.
