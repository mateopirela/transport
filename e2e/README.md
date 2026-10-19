# Pruebas de punta a punta (B26)

Dos suites, contra Supabase local con los datos demo ([docs/demo-local.md](../docs/demo-local.md)):

| Suite                             | Qué prueba                                                                                                                                                                                                  | Dónde corre                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Playwright (`e2e/`)               | Web: registro → verificación → publicar → negociar → aceptar → seguir el viaje, el **escenario estrella** del viaje de regreso y la web del transportista (ofertar por unidad de negocio)                   | CI (job `e2e`) y local                                                                         |
| Maestro (`apps/mobile/.maestro/`) | Móvil: transportista (login → viaje de regreso → ofertar → asignar; responder una contraoferta) y operador (consentimiento → estados → fotos → incidencia sin conexión → entrega; fin estimado de descarga) | Local, con simulador/emulador: `pnpm e2e:mobile` ([README](../apps/mobile/.maestro/README.md)) |

## Escenarios (Playwright)

- **`tests/shipper-journey.spec.ts`**: un cliente nuevo se registra en la web y confirma su correo (Mailpit), sube los documentos de su empresa, el admin los aprueba y aprueba la empresa, el cliente publica una carga MTY → GDL, negocia (oferta, contraoferta y contraoferta del transportista), acepta y sigue el viaje (asignado y con la salida del operador en la línea de tiempo).
- **`tests/incident-report.spec.ts`**: la clienta del viaje MTY → GDL de la seed (Ana) envía dos veces seguidas el mismo reporte de incidencia (las dos peticiones llevan el mismo `clientEventId`) y en la línea de tiempo queda una sola; después, sin recargar, un reporte nuevo lleva otra llave y crea otra incidencia.
- **`tests/return-trip.spec.ts`** (escenario estrella): la caja seca `CS53-01` está descargando en Guadalajara (viaje MTY → GDL de la seed). Su primera recomendación es la carga GDL → MTY; el transportista oferta, el cliente acepta en la web y el viaje de regreso queda contratado **antes de terminar la descarga**. Después el operador sube las fotos de entrega, termina la descarga y el transportista le asigna el viaje de regreso.
- **`tests/carrier-web-offer.spec.ts`** (web del transportista, G10a): Andrea, coordinadora del "Corredor MTY–GDL", entra a la web, ve la carga GDL → MTY como primera recomendación de `CS53-01`, busca una carga de caja seca (León → Apodaca) y oferta el precio propuesto; Héctor, coordinador de "Regional Monterrey", no ve esa recomendación ni esa negociación; Jorge, el Gerente, oferta en otra carga publicada a nombre de "Regional Monterrey" y solo Héctor la ve en sus negociaciones. La carga GDL → MTY no se toca: la contrata después `return-trip.spec.ts`.

El Gerente y el Coordinador usan la web desde G10a (D06-E1); en las dos primeras pruebas el transportista sigue actuando con las mismas RPC que llama la app (`support/actors.ts`), con su propio JWT y la anon key, así que RLS y las validaciones de cada RPC aplican igual que en el teléfono. El operador solo usa la app móvil, que Playwright no maneja: sus pantallas se prueban con Maestro.

Las pruebas modifican los datos demo: corren en serie, sin reintentos, y necesitan una base recién creada (`supabase db reset`).

## Correr en local

```sh
supabase start                       # o, si ya estaba arriba: supabase db reset
supabase status                      # URL de la API y anon key

# El build de Next.js incrusta las variables NEXT_PUBLIC_*.
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key de supabase status>
pnpm --filter @transport/web build

pnpm --filter @transport/e2e e2e:install   # una vez: Chromium de Playwright
pnpm --filter @transport/e2e e2e           # levanta `next start` en 127.0.0.1:3000
```

En puertos alternos (`eval "$(sh scripts/local-ports.sh 563)"`, ver [CONTRIBUTING.md](../CONTRIBUTING.md#puertos-alternos)), el script ya exporta `NEXT_PUBLIC_SUPABASE_URL`, `E2E_BASE_URL` y `E2E_MAILPIT_URL`: solo falta la anon key.

Sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: el formulario de cargas usa las ciudades predefinidas del corredor, que es lo que esperan las pruebas.

Variables opcionales:

| Variable          | Por defecto              | Para qué                                                                                             |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`    | `http://127.0.0.1:3000`  | Web bajo prueba                                                                                      |
| `E2E_WEB_SERVER`  | (vacía)                  | `off`: no levantar `next start` (usa la web que ya corre, p. ej. `pnpm --filter @transport/web dev`) |
| `E2E_MAILPIT_URL` | `http://127.0.0.1:54324` | Bandeja local de correo (`supabase status` → Mailpit)                                                |

`pnpm test` solo corre las pruebas unitarias de los helpers (`support/*.test.ts`); la suite de Playwright se corre con `pnpm --filter @transport/e2e e2e`.

Si una prueba falla, el reporte HTML con trazas queda en `e2e/playwright-report/` (en CI, como artefacto `playwright-report`): `pnpm --filter @transport/e2e exec playwright show-report`.
