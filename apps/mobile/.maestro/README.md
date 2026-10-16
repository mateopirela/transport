# Flujos de Maestro (B26)

Pruebas de punta a punta de la app móvil con [Maestro](https://maestro.mobile.dev), contra Supabase local con los datos demo ([docs/demo-local.md](../../../docs/demo-local.md)). **No corren en CI**: necesitan un simulador o emulador con la build de desarrollo instalada. La web se prueba con Playwright en CI ([e2e/README.md](../../../e2e/README.md)).

| Flujo                    | Usuario demo                 | Qué hace                                                                                                                  |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `01-carrier-offer.yaml`  | `jorge.villarreal@demo.test` | Entra, ve el viaje de regreso GDL → MTY de `CS53-01` (descargando en GDL) y oferta el precio propuesto                    |
| `02-carrier-assign.yaml` | `jorge.villarreal@demo.test` | Asigna `CS53-01` y a Pedro López al viaje ganado                                                                          |
| `03-operator-trip.yaml`  | `miguel.hernandez@demo.test` | Acepta compartir ubicación, registra salida, llegada e inicio de carga, toma las fotos de recolección y sale con la carga |

`02` necesita que el cliente haya aceptado la oferta de `01`: entra a la web como `luis.ramirez@demo.test`, abre la carga GDL → MTY (`/cliente/cargas/5eed0005-0000-4000-8000-000000000002`) → "Negociar y chatear" → "Aceptar".

## Requisitos

1. Maestro CLI (requiere Java 17+): `curl -fsSL "https://get.maestro.mobile.dev" | bash`.
2. Supabase local con la seed recién cargada: `supabase db reset`.
3. La build de desarrollo instalada (ver [../README.md](../README.md)), con `apps/mobile/.env` apuntando al Supabase local:
   - iOS (simulador): `pnpm --filter @transport/mobile ios`, `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.
   - Android (emulador): `pnpm --filter @transport/mobile android`, `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`.
4. El bundler corriendo: `pnpm --filter @transport/mobile start`.

## Correr

```sh
cd apps/mobile
maestro test -e APP_ID=mx.transport.app .maestro/                       # todos, en orden (config.yaml)
maestro test -e APP_ID=mx.transport.app .maestro/01-carrier-offer.yaml  # uno
```

`APP_ID` es el bundle id / paquete de la app (`APP_BUNDLE_ID`, por defecto `mx.transport.app`).

## Notas

- **Cámara:** las fotos de evidencia solo se toman con la cámara (B23). El simulador de iOS no tiene cámara: corre `03-operator-trip.yaml` en el emulador de Android (escena virtual) o en un teléfono. `subflows/shutter.yaml` usa los ids de la app de cámara del emulador; otra app de cámara necesita otros selectores.
- **Ubicación:** `launchApp` concede ubicación y cámara. En el emulador, fija una ubicación (p. ej. Apodaca, N.L.) para que cada evento guarde su lugar (D11).
- **Selectores:** los flujos buscan los textos en español de `packages/shared/src/copy/` y las etiquetas de accesibilidad de los campos. Si cambia un texto, actualiza el flujo.
- Los flujos cambian los datos demo: vuelve a correr `supabase db reset` antes de repetirlos.
