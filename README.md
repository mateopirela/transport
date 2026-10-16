# transport

Plataforma inteligente de transporte de carga para México: conecta empresas que necesitan mover mercancía con transportistas, y recomienda **viajes de regreso** para eliminar kilómetros vacíos.

> _Conseguir el siguiente viaje antes de que el camión termine el actual._

## Documentación

| Documento                                  | Contenido                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [docs/producto-v1.md](docs/producto-v1.md) | Qué construimos en la V1: perfiles, funciones, fuera de alcance y KPIs         |
| [docs/plan-v1.md](docs/plan-v1.md)         | Plan de implementación por bloques (PRs), olas, arquitectura y modelo de datos |
| [docs/decisiones.md](docs/decisiones.md)   | Registro de decisiones confirmadas y pendientes                                |
| [docs/demo-local.md](docs/demo-local.md)   | Datos demo MTY ↔ GDL de la base local: usuarios, contraseña y escenarios       |
| [docs/fuentes/](docs/fuentes/)             | Deck original, notas de la reunión inicial y análisis                          |

## Stack

Expo (iOS/Android) · Next.js (web) · Supabase (Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions) · Google Maps Platform

Piloto: **Monterrey ↔ Guadalajara**. Solo español.

## Desarrollo

Node 24 (`.nvmrc`) y pnpm. Monorepo con pnpm workspaces y Turborepo.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Convenciones y flujo de PR: [CONTRIBUTING.md](CONTRIBUTING.md). Instrucciones para agentes: [CLAUDE.md](CLAUDE.md).
