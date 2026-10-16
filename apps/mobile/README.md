# App móvil (Transportista y Operador)

Expo + Expo Router (B17). Se usa siempre una **build de desarrollo** (`expo-dev-client`), no Expo Go: la ubicación en segundo plano de B22 no corre en Expo Go.

## Configuración

Expo lee las variables de `apps/mobile/.env` (no se sube al repo; ver `.env.example` en la raíz):

```sh
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321   # simulador iOS; Android: http://10.0.2.2:54321; teléfono: IP de la LAN
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key que imprime `supabase start`>
EXPO_PUBLIC_EAS_PROJECT_ID=                        # opcional: sin él no hay push token
```

Sin URL o sin anon key la app muestra "Falta configuración" en lugar de fallar. Las builds de release solo aceptan `https`.

## Desarrollo

```sh
supabase start                 # desde la raíz del repo
pnpm --filter @transport/mobile ios       # compila la build de desarrollo y la instala en el simulador (Xcode)
pnpm --filter @transport/mobile android   # igual en Android (Android SDK)
pnpm --filter @transport/mobile start     # solo el bundler, para una build ya instalada
```

Con EAS (cuando exista la cuenta): `eas build --profile development` (dispositivo), `development-simulator`, `preview` (distribución interna) y `production`. Ver `eas.json`.

## Autenticación

- La sesión de Supabase se guarda en el Keychain / Keystore con `expo-secure-store`, partida en fragmentos de menos de 2 KB (`src/lib/chunked-storage.ts`). Android no respalda los datos de la app (`allowBackup: false`).
- Flujo PKCE: el enlace de confirmación de correo abre `transport://auth/callback?code=…`, que solo sirve en el teléfono donde se creó la cuenta. Ese URL debe estar en `auth.additional_redirect_urls` del proyecto de Supabase.
- Transportista: crea su cuenta y después registra su empresa (`create_company`), que queda "en revisión".
- Operador (D15): abre `transport://invite?code=…` (o escribe el código), crea su cuenta con el correo invitado y, al tener sesión, la app acepta la invitación (`accept_operator_invitation`, B04).
- Clientes y administradores ven un aviso para usar la web (D06).

## Alta del transportista y flota (B18)

- **Inicio** muestra el avance del alta: documentos de la empresa, unidades, operadores y rutas habituales.
- **Documentos** (empresa, unidad u operador): foto con la cámara, foto de la galería o PDF. Las fotos se reducen a 2000 px por lado y se guardan como JPEG (`src/lib/document-upload.ts`); el archivo se sube al bucket privado `documents` y se registra con `submit_document`.
- **Unidades**: alta, edición, baja, documentos y disponibilidad (`set_vehicle_availability`). Una unidad con un documento obligatorio vencido aparece como "No disponible" y el servidor rechaza marcarla disponible (`vehicle_expired_requirements`).
- **Operadores** (en "Más"): alta, edición, baja, documentos e invitación (`create_operator_invitation`): el código solo se muestra al generarlo y se comparte como enlace `transport://invite?code=…`.
- **Rutas habituales** y la ciudad de disponibilidad se eligen de una lista de ciudades del corredor (`CITY_PRESETS` en `@transport/shared`) mientras no exista la clave de Google Places.

## GPS en segundo plano del operador (B22)

- **Consentimiento** (`app/(operator)/location-consent.tsx`): explica qué se comparte, cuándo y con quién, con el aviso de privacidad (LFPDPPP). Al aceptar se registra en `location_consents` (`record_location_consent`, con la versión del texto y la plataforma) y solo entonces se pide el permiso del sistema "Siempre". Se retira en "Más" (`revoke_location_consent`), lo que detiene el seguimiento y borra los puntos sin enviar. El servidor rechaza puntos sin consentimiento activo.
- **Cuándo** (`trackingDecision` en `@transport/shared`): solo en estados de viaje activos (`en_route_to_pickup` … `unloading`), con consentimiento y permiso. Registrar la entrega lo detiene. Cerrar sesión lo detiene y borra la cola.
- **Cómo** (`src/lib/background-location.ts`): `expo-location` + `expo-task-manager`, precisión `Balanced`, un punto cada ~60 s o ~500 m (`EXPO_PUBLIC_TRACKING_INTERVAL_S` / `EXPO_PUBLIC_TRACKING_DISTANCE_M`). Android: servicio en primer plano con notificación fija. iOS: `UIBackgroundModes: location`, indicador azul y texto de "Siempre" (`permissionCopy.locationAlways`).
- **Sin señal** (`src/lib/location-store.ts`, `location-queue.ts`): cola en SQLite; se envía en lotes de hasta 500 puntos a `record_trip_locations` cuando hay 30 puntos o el más viejo tiene 5 min, y al volver a la app.
- Se prueba en un dispositivo real (no en Expo Go): ver la checklist del PR de B22.

## Incidencias sin conexión (F7)

- El reporte de incidencia del operador entra a la misma cola cifrada que los cambios de estado (`src/lib/trip-queue.ts`, `trip-sync.ts`): se guarda con su hora y se envía a `report_incident` en orden, con su id como llave idempotente (un reintento nunca la duplica). Hasta que el viaje cargado la muestra, aparece en la lista como "Pendiente de enviar".
- Sus fotos se pueden tomar antes de que se envíe: la foto guarda la llave del reporte (`incidentKey`) y `add_trip_evidence` resuelve la incidencia con `p_incident_client_event_id`. La foto espera en su cola hasta que el reporte llegó (`photoMustWait`); si el servidor rechaza el reporte, también rechaza sus fotos.
- Una incidencia no depende de los pasos del viaje: si el servidor rechaza un paso, las incidencias que siguen se envían igual, y una incidencia rechazada no descarta nada más.

## Cargas recomendadas y negociación (B19)

- **Inicio** (empresa aprobada): primero **Viajes de regreso**, las mejores cargas para cada unidad con viaje en curso (salen cerca de su destino después del fin estimado de descarga), y después **Cargas recomendadas**, la mejor unidad para cada carga, con el desglose del score (`matchExplanation`). Lo arma `buildCarrierFeed` en `@transport/shared`.
- **Recomendaciones:** por cada unidad se llama a la Edge Function `recommendations` (B08). Si la función no responde (por ejemplo, sin `supabase functions serve`), la app llama a `match_candidates` con el JWT del usuario y ordena con el mismo código puro (`recommend`), con distancias estimadas.
- **Cargas:** búsqueda de cargas abiertas por origen, destino y tipo de unidad (ciudades del corredor, `CITY_PRESETS`), y la lista de **Mis negociaciones**.
- **Detalle de carga:** ruta esquemática con los km en vacío de la unidad compatible más cercana (`match_candidates`) y los km con carga estimados; "Abrir en mapas" abre la ruta en la app de mapas del teléfono (no necesita clave). El mapa embebido queda para cuando existan las claves de Google Maps.
- **Negociación:** "Aceptar el precio propuesto" (oferta por el precio del cliente), "Negociar" (oferta o contraoferta con monto, condiciones y unidad), "Aceptar" o "Rechazar" la contraoferta del cliente y "Retirar" la oferta propia. Todo pasa por las RPC de B05, que validan actor y estado; la pantalla se actualiza por Realtime cuando el cliente responde.
- **Chat** de la negociación (B07): mensajes de texto en tiempo real (`send_message`, idempotente al reintentar) y lectura (`mark_conversation_read`). Los adjuntos que mande el cliente se indican, pero todavía no se abren desde la app.
- Para probar con la seed: `jorge.villarreal@demo.test` ve arriba la carga GDL → MTY para `CS53-01`, que está descargando en Guadalajara.

## Viajes y asignación del transportista (B20)

- **Viajes** (pestaña): los viajes ganados en secciones **Por asignar**, **En curso** (con el mapa), **Próximos** e **Historial** (entregados, cerrados y cancelados). Se actualiza al entrar y cada 60 s mientras está abierta (`trips` no está en Realtime).
- **Asignar operador** (detalle del viaje): se elige la unidad y el operador; arranca con la unidad de la oferta ganadora y su operador habitual. Se puede reasignar hasta que el operador salga. La pantalla avisa antes de lo que el servidor rechazaría (operador sin cuenta, unidad con documentos vencidos) y advierte si el tipo de unidad no es el pedido o si la unidad o el operador ya tienen otro viaje (`checkAssignment` en `@transport/shared`). Todo pasa por `assign_trip` (B06).
- **Push al operador:** `assign_trip` registra el evento `assigned` y el trigger de B07 encola la notificación `trip_assigned` para el operador; el despachador (B09) la envía a sus dispositivos. La app ahora guarda el token de cada teléfono en `push_tokens` (`register_push_token`) y lo quita al cerrar sesión (`unregister_push_token`). Tocar el push abre el viaje (operador: "Viaje asignado"; transportista: el detalle). Sin `EXPO_PUBLIC_EAS_PROJECT_ID` no hay token y la app sigue funcionando sin push.
- **Monitoreo:** mapa esquemático (origen, destino, trazo y última ubicación de cada unidad en camino), sin clave de Google Maps; "Ver ubicación en mapas" abre el punto en la app de mapas. Tras 15 min sin puntos muestra "Sin señal desde HH:MM". El mapa con calles queda para cuando existan las claves.
- **Documentos del viaje:** Carta Porte u otro documento, en PDF o foto, al bucket privado `trip-documents` (`{trip}/{uuid}.{ext}`) y registrados con `add_trip_document` (B15). Solo se guardan (D09). El cliente los ve en la web.
- Además: línea de tiempo, incidencias, conteo de fotos de evidencia y chat del viaje.

## Verificación

```sh
pnpm --filter @transport/mobile lint
pnpm --filter @transport/mobile typecheck
pnpm --filter @transport/mobile test
pnpm --filter @transport/mobile doctor
pnpm --filter @transport/mobile export   # bundles de iOS y Android (lo corre CI)
```
