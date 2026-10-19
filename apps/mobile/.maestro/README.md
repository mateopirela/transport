# Flujos de Maestro (B26, F14)

Pruebas de punta a punta de la app móvil con [Maestro](https://maestro.mobile.dev), contra Supabase local con los datos demo ([docs/demo-local.md](../../../docs/demo-local.md)). **No corren en CI** (un job de iOS es caro): necesitan un simulador o emulador con la build de desarrollo instalada. La web se prueba con Playwright en CI ([e2e/README.md](../../../e2e/README.md)).

Se corren en orden con `pnpm e2e:mobile` ([scripts/e2e-mobile.mjs](../../../scripts/e2e-mobile.mjs)), que reinicia la seed y, entre flujos, hace lo que la app no puede hacer (ver la columna "Antes").

| Flujo                               | Usuario demo                 | Antes (lo hace el script)                          | Qué hace                                                                                                                                          |
| ----------------------------------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-carrier-offer.yaml`             | `jorge.villarreal@demo.test` | `supabase db reset`                                | Entra, ve el viaje de regreso GDL → MTY de `CS53-01` (descargando en GDL) como recomendación y oferta el precio propuesto                         |
| `02-operator-unloading.yaml`        | `pedro.lopez@demo.test`      | El cliente (`luis.ramirez`) acepta la oferta (RPC) | Viaje en descarga: cambia el fin estimado, toma las fotos de entrega, escribe quién recibe y termina la descarga                                  |
| `03-carrier-assign.yaml`            | `jorge.villarreal@demo.test` |                                                    | Asigna `CS53-01` y a Pedro López al viaje de regreso ganado                                                                                       |
| `04-carrier-counteroffer.yaml`      | `carmen.navarro@demo.test`   |                                                    | Abre "Mis negociaciones", ve la contraoferta del cliente en Zapopan → MTY y la acepta: la carga queda contratada                                  |
| `05-operator-pickup.yaml`           | `miguel.hernandez@demo.test` |                                                    | Acepta compartir ubicación, registra salida, llegada e inicio de carga, toma las fotos de recolección y sale con la carga                         |
| `06-operator-incident-offline.yaml` | (sigue la sesión de 05)      | **Se cae la API** (para el contenedor de Kong)     | Reporta una incidencia y le toma una foto **sin conexión**: quedan en el teléfono como "Pendiente de enviar" / "1 foto espera…"                   |
| `07-operator-delivery.yaml`         | (sigue la sesión de 06)      | Vuelve la API                                      | "Enviar ahora": la incidencia llega como "Abierta" con su foto; después llegada a destino, inicio de descarga, fotos de entrega y entrega         |
| `08-operator-invite.yaml`           | (cuenta nueva: Mario Garza)  |                                                    | Abre el enlace demo `transport://invitacion/demo-operador-trn-…`, crea la cuenta con teléfono y contraseña y entra: "Sin viaje asignado"          |
| `10-coordinator-release.yaml`       | `hector.ibarra@demo.test`    | Un viaje de `TT-01` sale y Sofía lo cancela (RPC)  | G5: ve "Unidades por liberar (1)" en el inicio, abre `TT-01`, la libera en su última ubicación (Monterrey) y ve sus cargas recomendadas desde ahí |

Las capturas de cada paso (`takeScreenshot`) quedan en `e2e/mobile-results/screenshots/` (ignorada por git) y los registros de Maestro en `e2e/mobile-results/maestro/`.

## Requisitos

1. **Maestro CLI** (requiere Java 17+): `curl -fsSL "https://get.maestro.mobile.dev" | bash` (queda en `~/.maestro/bin`).
2. **Supabase local** arriba (`supabase start`), con las variables de [puertos alternos](../../../docs/demo-local.md#puertos-alternos) si las usas, en la misma terminal que el script.
3. **Build de desarrollo** instalada en el simulador, con `apps/mobile/.env` apuntando a ese Supabase y con la cámara de prueba:

   ```sh
   # apps/mobile/.env
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321      # o el puerto de tu API
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key de supabase status>
   EXPO_PUBLIC_E2E_FAKE_CAMERA=1                         # solo iOS (ver Notas)
   ```

   - iOS: `pnpm --filter @transport/mobile exec expo run:ios --device <id del simulador> --no-bundler`.
   - Android: `pnpm --filter @transport/mobile android` (`EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`), **sin** `EXPO_PUBLIC_E2E_FAKE_CAMERA`: en Android los flujos toman la foto con la cámara del emulador (`subflows/shutter.yaml`) y, con la cámara de prueba, esperarían un obturador que nunca aparece.

4. **Metro** corriendo: `pnpm --filter @transport/mobile exec expo start --dev-client --port 8090` (o el puerto que quieras).
5. **Docker** accesible desde la terminal (el flujo 06 para y arranca el contenedor de Kong de tu proyecto, `supabase_kong_<project_id>`).

## Correr

```sh
export MAESTRO_DEVICE=<id del simulador>     # xcrun simctl list devices | grep Booted
export METRO_URL=http://127.0.0.1:8090        # Metro tal como lo ve el dispositivo
pnpm e2e:mobile                               # reinicia la seed y corre todo (~15 min)
pnpm e2e:mobile --no-reset --from 05-operator-pickup   # retomar desde un paso
```

| Variable            | Por defecto             | Para qué                                                          |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| `MAESTRO_DEVICE`    | el único dispositivo    | Simulador o emulador donde corren los flujos                      |
| `METRO_URL`         | `http://127.0.0.1:8081` | Metro con el bundle (la app lo abre con un enlace del dev client) |
| `APP_ID`            | `mx.transport.app`      | Bundle id / paquete (`APP_BUNDLE_ID`)                             |
| `E2E_MOBILE_OUTPUT` | `e2e/mobile-results`    | Capturas y registros                                              |
| `MAESTRO_BIN`       | `maestro`               | Ruta del CLI de Maestro                                           |

Un flujo suelto, sin el script: `maestro --device <id> test -e APP_ID=mx.transport.app -e DEV_CLIENT_URL='exp+transport://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8090' apps/mobile/.maestro/01-carrier-offer.yaml`. Los flujos cambian los datos demo: vuelve a correr `supabase db reset` antes de repetirlos.

## Notas

- **Cámara:** las fotos de evidencia solo se toman con la cámara (B23) y el simulador de iOS no tiene. Con `EXPO_PUBLIC_E2E_FAKE_CAMERA=1`, **solo en una build de desarrollo** (`__DEV__`), "Tomar foto" / "Agregar foto" devuelven una foto fija ([src/lib/e2e-camera.ts](../src/lib/e2e-camera.ts)); la compresión, el hash, la cola, la subida y la RPC son las reales. Las builds de release ignoran la variable. Aunque `launchApp` concede la cámara, iOS a veces pregunta igual la primera vez: `subflows/take-photo.yaml` (y `subflows/sign-in.yaml`, si quedó abierto de una corrida interrumpida) tocan "Allow". Es solo para iOS: en Android `subflows/take-photo.yaml` siempre pasa por `subflows/shutter.yaml` (app de cámara del emulador), así que ahí la variable va vacía.
- **Sin conexión:** el simulador de iOS comparte la red de la Mac y Maestro no puede apagarla (`setAirplaneMode` solo existe en Android). El script "tira" la API parando el contenedor de Kong de tu Supabase local; para la app es lo mismo que perder la red (las peticiones fallan y todo se queda en la cola), salvo que el aviso "Sin conexión" de NetInfo no aparece. Para probarlo a mano: `docker stop supabase_kong_<project_id>`, reporta la incidencia, `docker start supabase_kong_<project_id>` y "Enviar ahora". El script siempre vuelve a arrancar el contenedor al terminar, aunque falle un flujo.
- **Dev client:** cada flujo abre la app con `DEV_CLIENT_URL`, así no toma el bundle de otro Metro que corra en la misma máquina (p. ej. en 8081).
- **Ubicación:** `launchApp` concede ubicación "Siempre" y cámara; los flujos fijan la ubicación con `setLocation` (Apodaca para la recolección, Guadalajara para la entrega) para que cada evento guarde su lugar (D11).
- **Selectores:** los flujos buscan los textos en español de `packages/shared/src/copy/`. Un campo de formulario coincide dos veces (su etiqueta y el input, cuya etiqueta de accesibilidad es el mismo texto): `subflows/fill-field.yaml` toca el elemento debajo de la etiqueta. Las tarjetas que se tocan leen todo su contenido (`'Guadalajara → Monterrey.*'`) y las pestañas, `'<Pestaña>, tab.*'`. Si cambia un texto, actualiza el flujo.
