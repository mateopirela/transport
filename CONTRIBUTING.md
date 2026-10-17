# Cómo contribuir

El trabajo se organiza en **bloques**: cada bloque de [docs/plan-v1.md](docs/plan-v1.md) es un PR. Antes de empezar, lee el plan (§0 y §1 y la sección de tu bloque), [docs/decisiones.md](docs/decisiones.md) y [docs/producto-v1.md](docs/producto-v1.md).

## Requisitos

- Node 24 (fijado en `.nvmrc`; usa `nvm use`).
- pnpm (la versión está fijada en `package.json#packageManager`; con Corepack o instalación directa).
- Docker y Supabase CLI para la base de datos local (a partir de B01).

## Comandos

| Comando                             | Qué hace                                                |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm install`                      | Instala dependencias de todo el monorepo                |
| `pnpm lint`                         | ESLint en todos los paquetes (sin warnings permitidos)  |
| `pnpm typecheck`                    | TypeScript estricto en todos los paquetes               |
| `pnpm test`                         | Vitest en todos los paquetes                            |
| `pnpm format` / `pnpm format:check` | Prettier: formatea / verifica (CI corre `format:check`) |

Base de datos (Supabase local, requiere Docker):

| Comando                                | Qué hace                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `supabase start`                       | Levanta Supabase local (o `supabase db start` para solo Postgres)                            |
| `supabase db reset`                    | Recrea la BD con las migraciones y los datos demo ([docs/demo-local.md](docs/demo-local.md)) |
| `supabase db reset --no-seed`          | Recrea la BD vacía (solo migraciones)                                                        |
| `supabase test db`                     | Corre los tests pgTAP de `supabase/tests/` (con o sin los datos demo)                        |
| `supabase test db supabase/seed-tests` | Verifica los datos demo y la matriz de seguridad de B24 (después de `supabase db reset`)     |
| `pnpm db:types`                        | Regenera `packages/shared/src/db.ts` (CI falla si quedó desactualizado)                      |
| `supabase migration new x`             | Crea una migración nueva; cada tabla nueva lleva RLS y pgTAP en el mismo PR                  |

Pruebas de punta a punta (Playwright, requiere el stack local con la seed): `pnpm --filter @transport/e2e e2e`. Ver [e2e/README.md](e2e/README.md).

### Puertos alternos

Por defecto Supabase local usa los puertos 54320–54329 y la web el 3000. Si chocan con otro proyecto (o con otro agente en paralelo), no edites `supabase/config.toml`: en la misma terminal, exporta las variables que imprime `scripts/local-ports.sh` y corre los comandos de siempre.

```sh
eval "$(sh scripts/local-ports.sh 563)"   # Supabase en 563xx (API 56321, BD 56322, Mailpit 56324); web en 3020
supabase start                            # también supabase status, db reset, test db, stop y pnpm db:types
pnpm --filter @transport/web dev          # next dev escucha en $PORT y usa NEXT_PUBLIC_SUPABASE_URL
pnpm --filter @transport/e2e e2e          # Playwright usa E2E_BASE_URL y E2E_MAILPIT_URL
```

El primer argumento reemplaza el `543` de los puertos por defecto; el segundo (opcional) fija el puerto de la web (por defecto `3000 + prefijo − 543`). Funciona porque Supabase CLI acepta variables `SUPABASE_<SECCIÓN>_<CLAVE>` (p. ej. `SUPABASE_API_PORT`, `SUPABASE_AUTH_SITE_URL`) que reemplazan los valores de `config.toml`. Sin esas variables todo usa los valores por defecto, como en CI. Las variables están descritas en [.env.example](.env.example) y el flujo de la demo en [docs/demo-local.md](docs/demo-local.md#puertos-alternos).

Turborepo cachea las tareas; para filtrar por paquete: `pnpm turbo run test --filter=@transport/shared`.

## Estructura

```
apps/web        Next.js (Cliente, Admin y, desde G10a, Gerente y Coordinador)  ← B11
apps/mobile     Expo (Gerente, Coordinador y Operador)                         ← B17
packages/shared Tipos, enums, zod, máquinas de estado, copy
supabase/       Migraciones, Edge Functions, pgTAP   ← B01
e2e/            Playwright (web) contra Supabase local; Maestro en apps/mobile/.maestro ← B26
```

## Convenciones (§0.4 del plan)

- **Idioma:** código, identificadores y nombres de BD en **inglés**. Textos de UI y documentación de producto en **español**.
- **Commits:** en inglés e imperativo (`Add trip events table`).
- **Textos de UI:** centralizados en `packages/shared/src/copy/`, no regados en componentes (solo español, D02).
- **Dinero:** centavos MXN en `bigint`; formato con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`. Nunca `float` para dinero.
- **Fechas:** `timestamptz` en BD; se muestran en `America/Mexico_City`.
- **Geografía:** PostGIS `geography(Point, 4326)`, más ciudad y estado en texto para filtros rápidos.
- **IDs:** `uuid` con `gen_random_uuid()`.
- **Borrado:** lógico (`archived_at`) en entidades de negocio. Mensajes, eventos de viaje y bitácora de auditoría son **inmutables**.
- **Seguridad:** toda autorización vive en Postgres (RLS y RPCs `security definer` con `search_path` fijo y validación explícita). Las apps solo usan la _anon key_ y el JWT del usuario; la _service role_ solo existe en Edge Functions y CI.
- **Transiciones de estado:** siempre por una RPC que valida la transición, nunca con un `update` libre desde el cliente.
- **Secretos:** nunca en el repo. Cada variable nueva se documenta en [.env.example](.env.example) sin valor real, y el código debe funcionar (degradado) si falta.

## Ramas y PR

- Rama: `v1/<id>-<slug>`, por ejemplo `v1/B07-chat-schema`.
- Título: `[B07] Chat y notificaciones: esquema`.
- La descripción sigue la [plantilla](.github/pull_request_template.md): qué, por qué, cómo probar, capturas, riesgos y seguimiento.
- Tamaño objetivo: menos de ~800 líneas cambiadas (sin lockfiles ni archivos generados). Si crece, se divide (`B07a`/`B07b`).
- Un bloque solo toca su alcance. Lo demás va a "Seguimiento".

## Gate de merge (D14)

1. CI en verde (`lint`, `typecheck`, `test` y, desde B01, `db`).
2. **Greptile aprueba**: su revisión más reciente, sobre el último commit, tiene confianza ≥ 4/5 y no deja comentarios de lógica o seguridad sin atender. Cada comentario se corrige o se responde en el hilo.
3. Merge con squash y se borra la rama.

Si tras 5 rondas Greptile no aprueba, o hay un desacuerdo irreconciliable, se escala a Mateo sin hacer merge. Las reglas de revisión están en [.greptile/](.greptile/) y **no se relajan** para conseguir la aprobación (tampoco el CI).

Bloques 🔒: antes de abrir el PR se corre `/security-review`, y la revisión de Greptile se pide con foco explícito (`@greptileai review` + foco).
