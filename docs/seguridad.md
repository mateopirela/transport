# Auditoría de seguridad y RLS (B24)

Revisión de la V1 antes del piloto: aislamiento entre empresas (RLS), Storage, funciones `security definer`, límites de frecuencia de las Edge Functions y dependencias. Fecha: 2026-10-16, sobre `main` con los bloques B00–B26 integrados.

**Resultado:** cero hallazgos altos abiertos. Lo que se encontró quedó corregido en este bloque o aceptado con su motivo (ver [Hallazgos](#hallazgos)).

## Modelo de seguridad (recordatorio)

- Toda la autorización vive en Postgres: RLS en cada tabla y RPC `security definer` con `search_path` fijo y validación explícita del que llama.
- Las apps solo usan la _anon key_ y el JWT del usuario. La _service role_ solo existe en Edge Functions y CI.
- Los clientes **no borran** filas (borrado lógico con `archived_at`) y solo escriben directo, por columnas concretas, en 7 tablas con política propia. Todo lo demás pasa por RPC.

## Cómo se verifica

Dos suites pgTAP, ambas en el job `db` de CI:

| Suite | Qué prueba |
| --- | --- |
| `supabase/tests/database/18_security_audit.test.sql` | Invariantes del catálogo, que también cubren lo que agreguen bloques futuros: anon sin privilegios en `public`; `authenticated` sin `DELETE`, `TRUNCATE` ni escrituras sobre la tabla completa; lista cerrada de tablas con escritura directa, cada una con su política; ninguna política para `anon`/`PUBLIC` ni con `true` a secas; tablas inmutables solo de lectura; vistas con `security_invoker`; Realtime solo en tablas con RLS; buckets privados con límite de tamaño y tipo; inventario cerrado de funciones `security definer`, con una sola firma por nombre (una sobrecarga no se cuela en la lista revisada). |
| `supabase/seed-tests/security_matrix.test.sql` | La matriz **rol × tabla × operación × otra empresa** sobre los datos demo (más una fila de prueba en cada tabla que la seed deja vacía). |

La matriz:

- **Lectura:** cada usuario de la seed (Cliente, Transportista y Operador de cada empresa), un usuario "ajeno" de cada rol (empresas aprobadas sin relación con la seed) y anon leen todas las tablas y los objetos de Storage. Cada fila visible debe pertenecer a su empresa según las reglas de propiedad de la prueba (`tests.ownership`). Esas reglas incluyen las excepciones de producto: las cargas abiertas son visibles para transportistas aprobados y el Cliente ve el GPS solo mientras el viaje está activo.
- **Actualización:** lo mismo con las filas que cada uno logra actualizar en las tablas con escritura directa. Borrar no está permitido para nadie (lo prueba la suite 18).
- **RPC:** los usuarios ajenos llaman cada RPC de cliente sobre filas de la seed. Cada llamada debe fallar con `42501`, o no cambiar nada y no devolver nada. Cualquier otro error (una función que no existe, un argumento o una fila de prueba rota) hace fallar la matriz, porque significa que la llamada no llegó a su validación. Hoy todas fallan con `42501`. Un caso de control confirma que el Operador del viaje sí puede hacer la misma llamada.

La matriz crece con el esquema: falla si una tabla nueva no tiene regla de propiedad o no tiene filas, y también si una RPC de cliente nueva no está en la matriz ni en la lista revisada de RPC que solo actúan sobre el propio usuario.

## Storage

| Bucket | Ruta | Sube | Lee |
| --- | --- | --- | --- |
| `documents` | `{empresa}/{company\|vehicle\|operator}/{dueño}/{uuid}.ext` | Cliente o Transportista de la empresa | La empresa (no sus operadores) y el Admin |
| `evidence` | `{viaje}/{etapa}/{uuid}.{imagen}` | Operador asignado, con el viaje activo o recién entregado | Partes del viaje |
| `trip-documents` | `{viaje}/{uuid}.{pdf\|imagen}` | Transportista del viaje (no cancelado) | Partes del viaje |
| `chat` | `{conversación}/{uuid}.{imagen\|pdf}` | Participantes | Participantes |

Los cuatro buckets son privados y limitan tamaño y tipo MIME. No hay políticas de `update` ni `delete`, así que nadie reemplaza ni borra un archivo subido. Las RPC que registran un archivo (`submit_document`, `add_trip_evidence`, `add_trip_document`, `send_message`) validan que la ruta sea la del dueño y que el archivo exista. Salvo en `submit_document`, también validan que lo haya subido quien llama.

## Funciones `security definer`

Se revisaron las 54 que podían llamar los clientes (55 con `consume_rate_limit`, de este bloque; incluye `track_product_event` de B25, que solo registra eventos del propio usuario) y las 14 que solo usa la service role (triggers y RPC de Edge Functions). Las cron (`expire_stale_loads`, `process_document_expiry`, `remind_stale_trip_locations`, `invoke_notification_dispatcher`) no son ejecutables por ningún rol de la API. Las RPC de Edge Functions (`claim_notifications`, `record_notification_dispatch`, `delete_push_tokens`, `consume_service_rate_limit`) no dependen solo del permiso de ejecución: además exigen el claim `role = service_role` del JWT (F2), así que un `grant` accidental a `authenticated` no las abre.

Criterios: `search_path` fijo, `auth.uid()` obligatorio, validación explícita de rol y empresa antes de leer o escribir, error `42501` sin revelar si la fila existe, revocadas de `PUBLIC` y `anon`, y escritas en SQL o PL/pgSQL. Todas cumplen. La suite 18 guarda el inventario: una función nueva que los clientes puedan ejecutar hace fallar CI hasta que se revisa y se agrega a la lista (y a la matriz).

**G1b (invitaciones por enlace).** Se agregan `create_invitation`, `revoke_invitation`, `accept_coordinator_invitation` e `invitation_preview` para clientes, y `redeem_operator_invitation_service` solo para la service role (exige además el claim `role = service_role`, como las RPC de Edge Functions). `invitation_preview` es la única función `security definer` que `anon` puede ejecutar, a propósito: el enlace es la credencial (token de 32 bytes aleatorios, 256 bits, del que solo se guarda el SHA-256), y el preview responde lo mismo (`22023`) para un token desconocido, mal formado, vencido, usado o revocado, sin devolver ningún id. Los tests 00 y 18 la listan como excepción revisada. Un restablecimiento de acceso solo se emite y se canjea para una cuenta con rol `operator` de la misma empresa (nunca para el Gerente de un hombre-camión), y solo lo emite el Gerente o un Coordinador de la unidad de negocio del operador.

**Excepción revisada (G7, D23): enlaces compartidos.** `public_shared_load` y `public_shared_trip` son, junto con `invitation_preview` (G1b), las **únicas** funciones `security definer` que `anon` puede ejecutar (las suites 00 y 18 lo fijan con una lista cerrada). Su única credencial es un token de 32 bytes aleatorios (`gen_random_bytes`, 256 bits, base64url) del que la tabla `share_links` guarda solo el SHA-256; el token se devuelve una vez en `create_share_link` y los clientes no pueden leer `token_hash` (permiso por columnas). Un token desconocido, vencido o revocado da el mismo `42501`. Devuelven JSON saneado (ciudades y estados, ventanas, tipo de carga, peso, unidad; en el viaje, estado, línea de tiempo sin notas, última posición solo mientras está activo, razón social del transportista y placa enmascarada) y nunca precio, direcciones, contactos, documentos, chat ni operador: la suite 37 compara las llaves con una lista permitida y la web las vuelve a validar con esquemas estrictos. `create_share_link`, `revoke_share_link` y `open_internal_share` (enlace interno: solo personal y operadores de la empresa que lo creó) exigen sesión.

**G4 (Mi empresa).** Se agregan para clientes `create_business_unit`, `rename_business_unit`, `archive_business_unit`, `set_coordinator_units`, `remove_company_member`, `move_vehicle_to_unit` y `move_operator_to_unit`. Todas empiezan por `require_manager_company_id()` (la empresa de `auth_fleet_company_id()`, o `42501`), así que solo el Gerente las usa y solo sobre filas de su propia empresa; un Coordinador, un operador o el Gerente de otra empresa reciben `42501` sin saber si la fila existe. `create_business_unit` solo crea en la empresa del que llama (lista de RPC con alcance propio de la matriz). Dar de baja a un Coordinador le quita la empresa y sus unidades de negocio en la misma transacción: como todas las políticas leen el perfil, pierde el acceso al instante, y se revocan los enlaces pendientes que emitió. El trigger `require_active_business_unit` (service role) impide agregar o mover camiones, operadores o negociaciones a una unidad de negocio archivada.

## Límites de frecuencia

| Edge Function | Límite | Llave | Al excederlo |
| --- | --- | --- | --- |
| `recommendations` | 30 llamadas por minuto | Usuario (`auth.uid()` del JWT) | `429` con `Retry-After`. La app ordena los candidatos con distancias estimadas, sin gastar Routes |
| `dispatch-notifications` | 10 ejecuciones por minuto | Global | `429`. pg_cron vuelve a intentar al minuto siguiente |
| `shared-document-url` (G6) | 30 llamadas por minuto | Usuario (`auth.uid()` del JWT) | `429` con `Retry-After`. Cada llamada firma un documento del transportista y escribe la bitácora de consultas |

Las RPC de cliente más costosas o abusables también tienen límite propio (F12), por usuario y por minuto:

| RPC | Límite | Qué cuenta | Motivo del valor |
| --- | --- | --- | --- |
| `send_message` | 60 mensajes por minuto | Cada mensaje nuevo | Una persona escribe muy por debajo de esto; frena el spam y las notificaciones que genera cada mensaje |
| `report_incident` | 20 incidencias por minuto | Cada incidencia nueva | Un viaje real tiene pocas; deja margen para que la cola del teléfono envíe de golpe las que guardó sin conexión |
| `add_trip_evidence` | 120 fotos por minuto | Cada foto registrada | Cada foto se sube antes a Storage (segundos por foto), así que vaciar la cola offline queda muy por debajo |
| `create_load` | 30 cargas por minuto | Cada borrador nuevo | Crear una carga lleva un formulario completo; 30 por minuto solo lo alcanza un script |
| `make_offer`, `counter_offer` (y `admin_create_offer`) | 60 ofertas por minuto, en conjunto | Cada oferta o contraoferta nueva | Negociar es manual; frena las ofertas en masa y sus notificaciones |
| `record_trip_locations` | 120 llamadas por minuto | Cada lote (hasta 500 puntos), no cada punto | La app manda un lote cada pocos minutos y, al recuperar señal, hasta 10 lotes por corrida: un atraso de horas se vacía sin chocar |
| `create_invitation` (G1b) | 20 enlaces por minuto | Cada invitación creada | Invitar es manual; frena a un script que acuñe enlaces en masa |
| `create_share_link` (G7) | 30 enlaces por minuto | Cada enlace nuevo | Una persona comparte unos pocos enlaces; solo frena scripts que llenen `share_links` |

Al excederlo, la RPC falla con SQLSTATE `PT429` (PostgREST responde HTTP `429`) y el mensaje `rate limit exceeded`; la pista dice en cuántos segundos se libera. Las colas del teléfono (pasos e incidencias, fotos y ubicaciones) lo tratan como reintentable: conservan lo pendiente y lo mandan en la siguiente corrida, sin perder ni reordenar nada. Se cuenta con un trigger sobre la tabla que escribe cada RPC (`enforce_rate_limit`), dentro de la misma transacción: una llamada rechazada (por el límite o por otra validación) no consume, y un reintento que la RPC contesta por su llave de idempotencia tampoco, porque no crea fila. Las escrituras sin usuario (service role, pg_cron, seed) no se limitan. Estos buckets (alcance `rpc`) no se pueden consumir con `consume_rate_limit`.

Se implementan con una ventana fija en Postgres (`rate_limit_counters`, sin acceso directo de clientes) mediante `consume_rate_limit` (con el JWT del usuario) y `consume_service_rate_limit` (solo service role: el permiso de ejecución y, además, el claim `role` del JWT). Los límites viven en `rate_limit_policy`, así que el cliente no puede elegirlos. Si el contador no responde, las funciones fallan cerradas (`502`). La ventana vigente se decide con la fila bloqueada y nunca retrocede: una llamada atrasada del minuto anterior cuenta en la ventana nueva en lugar de reiniciarla.

Supabase Auth ya limita registro, inicio de sesión y correos (`[auth.rate_limit]` en `supabase/config.toml`).

## Dependencias

`pnpm audit` corre en CI (job `audit`) y falla con cualquier aviso alto o crítico que no esté en la lista revisada (`auditConfig.ignoreGhsas` en `pnpm-workspace.yaml`).

| Aviso | Paquete | Por dónde entra | Decisión |
| --- | --- | --- | --- |
| GHSA-86w9-cpqp-85rv (alto) | `node-forge` ≤ 1.4.0 | `@expo/code-signing-certificates` (CLI de Expo) | Aceptado: herramienta de desarrollo, no va en la app. Sin versión corregida |
| GHSA-vfj7-8cjw-p6xm (alto) | `braces` ≤ 3.0.3 | `@next/eslint-plugin-next` (lint) | Aceptado: solo lint. Sin versión corregida |
| GHSA-vcc3-ghjq-m6fr (moderado) | `decode-uri-component` 0.2.2 | `query-string` de `expo-router` | Seguimiento: la corrección (0.5.0) solo existe como ESM y rompería `query-string` 7. Hay que esperar a que `expo-router` la adopte |
| GHSA-w5hq-g745-h8pq (moderado) | `uuid` 7 | `xcode` (config plugins de Expo, en build) | Aceptado: solo en build, y la app no usa la API afectada (`buf`) |

`pnpm audit` no cubre las Edge Functions (Deno). Su código importa el del repo y una sola dependencia remota: `npm:@sentry/deno@11.7.0` (B25). Se carga solo si hay `SENTRY_DSN`, con la versión exacta fijada y su árbol bloqueado con integridad en `supabase/functions/*/deno.lock`. Para actualizarla hay que revisar sus avisos (`npm audit` de `@sentry/deno` en esa versión, o GitHub Advisories) y regenerar los `deno.lock` en el mismo PR. Las acciones de CI están fijadas por SHA.

## Hallazgos

| # | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| 1 | Media | Los privilegios por defecto de Supabase en `public` daban a `anon` y `authenticated` **todos** los permisos sobre cada tabla nueva, incluido `TRUNCATE`, que RLS no cubre. Las tablas actuales los revocaban una por una; una migración futura que lo olvidara quedaba abierta. | Corregido: la migración `20261019000000_security_hardening.sql` cierra tablas y secuencias por defecto, y la suite 18 lo prueba. |
| 2 | Media | `recommendations` no tenía límite de frecuencia: una cuenta podía agotar el presupuesto de Google Routes. | Corregido: 30 llamadas por minuto por usuario. |
| 3 | Baja | `dispatch-notifications` no limitaba las ejecuciones: quien tuviera el secreto podía saturar Expo y el proveedor de email. | Corregido: 10 ejecuciones por minuto. |
| 4 | Baja | `register_push_token` reasigna al usuario actual un token que ya era de otro (traspaso de dispositivo). Requiere conocer el token Expo del otro dispositivo, que nunca sale del teléfono ni del servidor. | Aceptado (comportamiento esperado al cambiar de cuenta en un teléfono). |
| 5 | Baja | Avisos altos en dependencias de desarrollo sin corrección publicada. | Aceptado y vigilado por CI (ver [Dependencias](#dependencias)). |
| 6 | Informativa | Las RPC de cliente (por ejemplo `send_message`) no tenían límite de frecuencia propio; PostgREST no lo trae. | Corregido (F12): límite por usuario en `send_message`, `report_incident`, `add_trip_evidence`, `create_load`, ofertas y contraofertas, y `record_trip_locations` (ver [Límites de frecuencia](#límites-de-frecuencia)); la suite 25 lo prueba. |
| 7 | Informativa | `decode-uri-component` moderado en el runtime de `expo-router`. | Seguimiento (ver [Dependencias](#dependencias)). |

## Cómo correrla

```sh
supabase db reset && supabase test db supabase/seed-tests   # seed + matriz
supabase test db                                  # suite pgTAP (con o sin seed)
pnpm audit --audit-level high
```
