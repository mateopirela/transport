# Entornos, despliegue y rollback (B27)

Runbook para llevar la plataforma a `staging` y `production`, y para regresar a la versión anterior si algo sale mal. Los workflows ya están en el repo; mientras faltan las cuentas en la nube, **se saltan con un aviso** y CI sigue en verde.

## 1. Entornos

| Entorno      | Supabase                             | Web (Vercel)                             | App móvil (EAS)                                    | Sentry        |
| ------------ | ------------------------------------ | ---------------------------------------- | -------------------------------------------------- | ------------- |
| `local`      | Docker (`supabase start`) con la seed | `pnpm dev`                               | perfil `development`                               | `development` |
| `staging`    | proyecto `transport-staging`, sin seed | despliegue _preview_ (alias opcional)    | perfil `preview` (distribución interna, APK)       | `staging`     |
| `production` | proyecto `transport-prod`, sin seed  | despliegue _production_                  | perfil `production` → TestFlight y Play (interna)  | `production`  |

- `supabase/seed.sql` son datos demo: **nunca** se cargan en la nube (los workflows no usan `--include-seed`).
- Las apps solo reciben la URL y la _anon key_ de su proyecto. La _service role_ solo existe dentro de Supabase (Edge Functions); CI usa un token de acceso personal y la contraseña de la BD, nunca la _service role_.

## 2. Qué automatiza CI

| Workflow                                                  | Cuándo                                    | Qué hace                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [deploy-staging.yml](../.github/workflows/deploy-staging.yml) | cada merge a `main` (o manual)            | migraciones → Edge Functions → web en staging                                                              |
| [release.yml](../.github/workflows/release.yml)           | manual, desde `main` o un tag `v*`        | lo mismo en producción, después de la aprobación del environment `production`                              |
| [mobile-release.yml](../.github/workflows/mobile-release.yml) | manual, desde `main` o un tag `v*`        | `eas build` del perfil elegido y, con `submit`, envío a TestFlight y a la pista interna de Play            |

Los tres usan [deploy.yml](../.github/workflows/deploy.yml) o EAS. Cada grupo de secretos se revisa antes de usarse: si falta completo, se salta con un aviso; si falta a medias, el job falla (para no desplegar la mitad).

Orden dentro de un despliegue: **migraciones → funciones → web**. Si una migración falla, no se despliega nada más.

## 3. Configuración inicial (una sola vez)

### 3.1 Supabase (dos proyectos)

1. Crear `transport-staging` y `transport-prod` en la región más cercana (p. ej. `us-east-1` o la que se acuerde). Guardar la contraseña de la BD de cada uno en el gestor de contraseñas.
2. **Auth** (Dashboard → Authentication):
   - _Site URL_: la URL pública de la web del entorno.
   - _Redirect URLs_: `https://<web>/**` y `transport://auth/callback` (app móvil).
   - Plantillas de correo: copiar las de `supabase/templates/` (confirmación y recuperación, en español).
   - SMTP propio con el proveedor de email (Resend) y el dominio verificado.
3. **Secretos de Edge Functions** (Dashboard → Edge Functions → Secrets): `NOTIFICATIONS_DISPATCH_SECRET`, `GOOGLE_ROUTES_API_KEY`, `ROAD_DISTANCE_FACTOR`, `MATCHING_WEIGHTS` (opcional), `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `EXPO_ACCESS_TOKEN` (opcional), `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `LOG_LEVEL`. Significado de cada una en [.env.example](../.env.example).
4. Después del primer despliegue, guardar en **Vault** la URL de la función y el secreto para el cron de notificaciones (SQL Editor):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-notifications', 'notifications_dispatch_url');
   select vault.create_secret('<NOTIFICATIONS_DISPATCH_SECRET>', 'notifications_dispatch_secret');
   ```
5. **Primer Admin:** registrarlo como usuario normal y promoverlo en el SQL Editor: `update public.profiles set role = 'admin' where id = '<uuid>';`.
6. Respaldos: en producción activar PITR (plan Pro) antes de abrir el piloto.

### 3.2 GitHub (Settings → Environments)

Crear los environments `staging` y `production` con estos **secretos** (los mismos nombres en ambos, con los valores de cada entorno):

| Secreto                 | De dónde sale                                                        |
| ----------------------- | -------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens (uno por entorno, nombrado)       |
| `SUPABASE_PROJECT_REF`  | el _ref_ del proyecto (Settings → General)                           |
| `SUPABASE_DB_PASSWORD`  | la contraseña de la BD del proyecto                                  |
| `VERCEL_TOKEN`          | Vercel → Account Settings → Tokens (con alcance al equipo)           |
| `VERCEL_ORG_ID`         | `.vercel/project.json` tras `vercel link` (no se sube) o Settings    |
| `VERCEL_PROJECT_ID`     | igual que el anterior                                                |
| `EXPO_TOKEN`            | expo.dev → Access tokens (robot user)                                |

En `production`: **Required reviewers** (Mateo) y _Deployment branches and tags_ limitado a `main` y `v*`. Variables (no secretas): `EAS_PROJECT_ID` a nivel repositorio (ver §3.4), `ASC_APP_ID` en `production` (id numérico de la app en App Store Connect) y, si se usa, `WEB_STAGING_ALIAS` en `staging` (p. ej. `staging.<dominio>`).

### 3.3 Vercel (web)

1. Crear el proyecto desde el repo con **Root Directory** `apps/web` (framework Next.js, pnpm).
2. Los despliegues los hace CI con el CLI. Para que producción no salga antes que las migraciones, desactivar los despliegues automáticos de Git (Settings → Git → _Ignored Build Step_: `exit 0`, o desconectar el repositorio).
3. Variables de entorno: en **Preview** las de staging y en **Production** las de producción: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE` (opcional) y, para subir source maps, `SENTRY_AUTH_TOKEN` (sensible), `SENTRY_ORG`, `SENTRY_PROJECT`.
4. Dominio propio para producción. El aviso de privacidad queda en `https://<dominio>/aviso-de-privacidad` y los términos en `/terminos` (los enlazan las tiendas y la app).

### 3.4 Expo / EAS y tiendas

1. `cd apps/mobile && npx eas-cli init` (crea el proyecto) → guardar el id como `EXPO_PUBLIC_EAS_PROJECT_ID` (local) y como **variable del repositorio** `EAS_PROJECT_ID` en GitHub (Settings → Variables → Actions; es público). **Mobile release** la necesita en el runner: EAS identifica el proyecto con `app.config.ts` antes de poder leer sus variables remotas.
2. Variables de EAS (expo.dev → Environment variables) en `preview` (staging) y `production`: `EXPO_PUBLIC_SUPABASE_URL` (https), `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID`, `EXPO_PUBLIC_SENTRY_DSN`, `APP_BUNDLE_ID` y, como secretos, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
3. Apple Developer: crear el App ID con el bundle id, la app en App Store Connect (su id va a `ASC_APP_ID`) y una API key de App Store Connect; cargar certificados y la key con `npx eas-cli credentials` (una vez, en modo interactivo).
4. Google Play Console: crear la app, subir **a mano** el primer AAB (Google lo exige) y una cuenta de servicio con acceso a la API; cargar su JSON con `npx eas-cli credentials`. El envío usa la pista `internal` con estado `draft`; cuando la app ya tenga una versión publicada en esa pista, cambiar `releaseStatus` a `completed` en `apps/mobile/eas.json`.
5. Fichas y justificación de ubicación: [tiendas.md](tiendas.md).

## 4. Liberar una versión

1. Merge a `main` → **Deploy staging** corre solo. Revisar el resumen del job (pendientes de migración, URL de la web).
2. Probar en staging el flujo principal: registro → verificación → publicar → ofertar → asignar → estados y GPS → entrega. Con una build `preview` de la app.
3. Crear el tag: `git tag v2026.10.20 && git push origin v2026.10.20` (formato `vAAAA.MM.DD[-n]`).
4. Actions → **Release production** → _Run workflow_ sobre el tag, con `migrate` activado. Aprobar el environment. El paso _List pending migrations_ muestra qué se aplicará.
5. Actions → **Mobile release** sobre el mismo tag, perfil `production`, `submit` activado. Al terminar el procesamiento de Apple/Google, habilitar la build para los grupos de prueba.
6. Verificar en producción: iniciar sesión en la web, abrir `/aviso-de-privacidad`, y en la app el inicio de sesión y una notificación de prueba. Revisar Sentry (`production`).

### Reglas para migraciones en producción

- Las migraciones son **solo hacia adelante**: nunca se edita ni se borra una migración ya aplicada.
- Deben ser **compatibles con la versión anterior** de las apps: la web se despliega después de la BD y en los teléfonos conviven versiones viejas. Para renombrar o borrar columnas: primero agregar (_expand_), desplegar las apps, y borrar en una versión posterior (_contract_).
- Revisar en el PR cualquier `drop`, `alter ... type` o `not null` sobre tablas con datos, y cuánto bloquean las tablas grandes (`trip_locations`).

## 5. Rollback

| Qué falla                  | Cómo se regresa                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                        | Inmediato: Vercel → Deployments → el despliegue anterior → _Instant Rollback_ (o `vercel rollback`). Después, corregir en `main`.                                                                                                                       |
| Edge Functions             | **Release production** sobre el tag anterior con `migrate` **desactivado**: vuelve a desplegar funciones y web de esa versión sin tocar la BD.                                                                                                          |
| Migración (BD)             | No hay "deshacer" automático. Se escribe una migración nueva que compense (_roll forward_), se prueba en staging y se libera. Si hubo pérdida o corrupción de datos: restaurar con PITR al minuto anterior al despliegue (Dashboard → Database → Backups). |
| App móvil                  | No hay actualizaciones OTA en la V1. iOS: en TestFlight, expirar la build mala (los testers pueden instalar la anterior). Android: Play no regresa a un `versionCode` menor, así que promover la versión anterior no sirve a quien ya instaló la mala; correr **Mobile release** sobre el tag anterior (perfil `production`, `submit` activado): `autoIncrement` con versiones remotas le da un `versionCode` mayor y reemplaza a la mala. Después, corregir y sacar otra build. |
| Secreto filtrado           | Rotarlo en su origen (Supabase, Vercel, Expo, Resend, Google), actualizar el secreto del environment y volver a desplegar. Revisar los logs de acceso.                                                                                                  |

Si un despliegue falla a la mitad (p. ej. migraciones aplicadas pero falló la web), basta con volver a correr el workflow: `db push` solo aplica lo pendiente y los demás pasos son idempotentes.

## 6. Piloto con la empresa de JP

- iOS: agregar a los operadores y al transportista como testers externos o internos en TestFlight (necesitan la app TestFlight).
- Android: agregar sus correos a la lista de testers de la pista interna y compartirles el enlace de participación.
- Antes del primer viaje real: aviso de privacidad y términos **revisados por un abogado** (hoy son borradores: `packages/shared/src/copy/legal.ts`, `draft: true`), empresa de JP aprobada por el Admin y sus documentos al día.
