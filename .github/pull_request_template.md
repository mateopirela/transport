<!-- Título: [BXX] Nombre del bloque (ver docs/plan-v1.md) -->

## Qué

<!-- Qué cambia en este PR. Bloque del plan y enlace a su sección. -->

Bloque: `BXX` · sección en `docs/plan-v1.md`

## Por qué

<!-- Objetivo del bloque y decisiones relevantes (D01, D02, ...). -->

## Cómo probar

<!-- Comandos y pasos manuales para verificarlo. -->

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## Capturas

<!-- Obligatorio en PR de UI (capturas o video corto). Si no hay UI: "N/A". -->

## Riesgos

<!-- Seguridad, RLS, concurrencia, privacidad, costo, migraciones. -->

## Seguimiento

<!-- Lo que quedó fuera de alcance o se encontró y no se arregló aquí. -->

## Definición de terminado (§0.3)

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde, local y en CI.
- [ ] Tablas nuevas con RLS activada y tests pgTAP de la matriz rol × operación (o N/A).
- [ ] Transiciones de estado solo por RPC que las valida (o N/A).
- [ ] La lógica pura tiene tests unitarios (Vitest).
- [ ] Textos de UI en español y en `packages/shared/src/copy/`; capturas incluidas (o N/A).
- [ ] Tipos de BD regenerados con `pnpm db:types` si cambió el esquema (o N/A).
- [ ] Sin secretos en el repo; variables nuevas documentadas en `.env.example`.
- [ ] Greptile aprueba el PR (D14).
