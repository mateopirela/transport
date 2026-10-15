# transport

Plataforma inteligente de transporte de carga para México: conecta empresas que necesitan mover mercancía con transportistas, y recomienda **viajes de regreso** para eliminar kilómetros vacíos.

> *Conseguir el siguiente viaje antes de que el camión termine el actual.*

## Documentación

| Documento | Contenido |
|---|---|
| [docs/producto-v1.md](docs/producto-v1.md) | Qué construimos en la V1: perfiles, funciones, fuera de alcance y KPIs |
| [docs/plan-v1.md](docs/plan-v1.md) | Plan de implementación por bloques (PRs), olas, arquitectura y modelo de datos |
| [docs/decisiones.md](docs/decisiones.md) | Registro de decisiones confirmadas y pendientes |
| [docs/fuentes/](docs/fuentes/) | Deck original, notas de la reunión inicial y análisis |

## Stack

Expo (iOS/Android) · Next.js (web) · Supabase (Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions) · Google Maps Platform

Piloto: **Monterrey ↔ Guadalajara**. Solo español.
