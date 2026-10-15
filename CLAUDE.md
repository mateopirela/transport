# CLAUDE.md

Instrucciones para agentes que trabajan en este repo. Plataforma de transporte de carga en México (V1, piloto Monterrey ↔ Guadalajara).

## Antes de escribir código

1. Lee [docs/plan-v1.md](docs/plan-v1.md): §0 (ciclo de vida, gate D14, definición de terminado, convenciones), §1 (arquitectura y modelo de datos) y **la sección de tu bloque**.
2. Lee [docs/decisiones.md](docs/decisiones.md) (las decisiones confirmadas son obligatorias) y [docs/producto-v1.md](docs/producto-v1.md).
3. Revisa lo que ya está en `main`: reutiliza, no dupliques. Sigue [CONTRIBUTING.md](CONTRIBUTING.md).

## Reglas

- **Un PR = un bloque.** Respeta el alcance y el "fuera de alcance" del plan. Lo que encuentres fuera de alcance va a la sección "Seguimiento" del PR; no lo arregles ahí.
- **Definición de terminado (§0.3):** lint, typecheck y test en verde; RLS + pgTAP en cada tabla nueva; transiciones solo por RPC; tests de Vitest para lógica pura; capturas en PR de UI; `pnpm db:types` si cambió el esquema; sin secretos y variables en `.env.example`.
- **Idioma:** código, identificadores, nombres de BD y commits en inglés (commits en imperativo). Textos de UI y documentación de producto en español, con los textos de UI en `packages/shared/src/copy/`.
- **Secretos:** nunca en el repo. Las claves externas (Google Maps, EAS, Sentry, email, Supabase en la nube) se leen de variables de entorno y el código se degrada con elegancia si faltan. No crees cuentas ni recursos en la nube.
- **CI y Greptile:** no quites ni relajes jobs de CI ni reglas de `.greptile/` para pasar una revisión. Puedes agregar.
- **Git:** rama `v1/<id>-<slug>` desde `origin/main`; nunca push directo ni force-push a `main`; no toques ramas o PR de otros bloques.

## Gate de merge (D14)

Se hace merge (squash) solo cuando CI está verde y **Greptile aprueba**: su revisión más reciente sobre el commit HEAD tiene confianza ≥ 4/5 y no deja comentarios de lógica o seguridad sin atender. Responde **cada** comentario (corrige o explica en el hilo). Para pedir otra revisión: comentario `@greptileai review` (en bloques 🔒, seguido del foco). Tras 5 rondas sin aprobación, o ante un desacuerdo irreconciliable, se escala a Mateo y no se hace merge.

## Comandos útiles

```sh
nvm use                 # Node 24 (.nvmrc)
pnpm install
pnpm lint               # ESLint (0 warnings) en todos los paquetes
pnpm typecheck          # tsc estricto
pnpm test               # Vitest
pnpm format             # Prettier (CI corre pnpm format:check)
pnpm turbo run test --filter=@transport/shared

gh pr checks <n> --watch                       # esperar CI
greptile review                                # revisión previa de la rama (CLI)
greptile config                                # ver la configuración efectiva de Greptile
```

A partir de B01: `supabase start`, `supabase db reset`, `supabase test db` y `pnpm db:types`.
