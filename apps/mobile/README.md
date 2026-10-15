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

## Verificación

```sh
pnpm --filter @transport/mobile lint
pnpm --filter @transport/mobile typecheck
pnpm --filter @transport/mobile test
pnpm --filter @transport/mobile doctor
pnpm --filter @transport/mobile export   # bundles de iOS y Android (lo corre CI)
```
