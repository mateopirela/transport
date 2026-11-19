# Plan de acceso sin fricción (ola S)

Cuarta ola sobre el acceso. Sale de la auditoría del 2026-11-19 que pidió Mateo ("necesitamos hacer todos los flujos más sencillos para el usuario, ahora tiene mucha fricción para poder entrar"). Las decisiones están en [decisiones.md](decisiones.md), "Enmiendas del 2026-11-19": D42-E1, D48, D15-E3, D49, D50 y D51.

**Qué se encontró** (auditoría de `main` en `f785a1f`):

| Fricción | Hoy |
|---|---|
| Demasiado antes de entrar | Cliente, Gerente y hombre-camión: ~9 pantallas y 16–17 campos obligatorios (6 de cuenta + 10–11 fiscales) antes de ver el producto. La contraseña se escribe dos veces en todos los formularios |
| Confirmación sin salida | No hay "reenviar correo" en la web (`(auth)/verificar-correo/page.tsx`) ni en la app (`components/check-email.tsx`). En la app el enlace es PKCE (`transport://auth/callback`): solo sirve en el mismo teléfono e instalación; si falla, `auth/callback.tsx` manda al inicio de sesión, que responde "confirma tu correo" |
| Sin recuperar contraseña en la app | `apps/mobile/src` no tiene "olvidé mi contraseña" |
| Errores tardíos | Los datos fiscales se capturan antes de confirmar el correo, pero `register_company` corre después (`auth/confirm/route.ts`, `company.tsx`): un RFC repetido aparece hasta `/completar-registro` |
| Bloqueo hasta la aprobación (web) | `HOME_ONLY` en `apps/web/src/lib/routing.ts` no deja abrir `/cliente` ni `/transportista` con la empresa sin aprobar: el cliente no puede dejar un borrador y el Gerente no puede armar su flota, así que hay dos rondas de revisión antes del primer viaje. La app sí deja entrar (`(carrier)/(tabs)/home.tsx`) |
| Sin aviso | El enum `notification_type` (creado en `20261015200000_chat_notifications.sql` y ampliado en migraciones posteriores) no tiene "empresa aprobada/rechazada" |
| Datos repetidos | Contacto de la empresa (solo se prellena el nombre en la web); el operador reescribe nombre y teléfono (`OperatorRedeem` en `invitacion/[token].tsx` no usa `invitee_name`, que el formulario del coordinador sí usa; la invitación no guarda teléfono); el hombre-camión sube su INE dos veces; el coordinador toca "Unirme" después de confirmar |

**Qué no cambia:** D45 (candado de viajes), los documentos (D16, D16-E3, D44), la revisión manual (D10-E1), D46 (segundo factor, bloqueo, sesiones), D06-E1 (superficies), la confirmación obligatoria del correo, las invitaciones (D43) y el panel de marca del acceso.

---

## 0. Cómo se ejecuta

### 0.1 Reglas comunes

Las de [plan-registro.md §0.1](plan-registro.md) completas, con su definición de terminado (§0.4, además de plan-v1.md §0.3) (ciclo y gate D14, UI Fulmis con capturas claro/oscuro en `assets/<ID>-screenshots`, backend con autorización en Postgres, copy en `packages/shared/src/copy/`, contraseñas nunca en almacenamiento, E2E por rol y nombre accesible, sin recursos en la nube). Además:

- **No se relaja ninguna RPC ni RLS.** D48 abre pantallas, no permisos. Si un bloque encuentra una pantalla que ahora se puede abrir y cuya RPC o RLS no exige empresa aprobada donde debería, lo corrige en el backend en el mismo PR (🔒) o lo reporta en "Seguimiento"; nunca lo tapa solo en la UI.
- **Sin RPC anónimas nuevas.** Nada que permita averiguar si un correo, un teléfono o un RFC ya existe sin sesión.
- **Nombres accesibles:** desaparece "Confirma la contraseña"; los demás se conservan. Cada bloque actualiza los flujos de Playwright y Maestro que toca **en el mismo PR**.

### 0.2 El recorrido nuevo

| Perfil | Crear la cuenta | Confirmar | Adentro: "Completa tu cuenta" | Bloqueado hasta aprobar |
|---|---|---|---|---|
| Cliente (web) | Tipo, nombre, teléfono, correo, contraseña, términos | Código o enlace; reenvío | 1 datos fiscales → 2 CSF, INE, poder si aplica → 3 póliza (opcional) → 4 estado. Con el paso 1 ya crea cargas en borrador | Publicar la carga |
| Gerente (web o app) | Igual | Igual | 1 datos fiscales → 2 documentos → 3 unidades, camiones, operadores, invitaciones → 4 estado | Ofertar, recomendaciones, asignar |
| Hombre-camión (web o app) | Igual | Igual | 1 datos fiscales → 2 documentos → 3 su camión y sus documentos de operador → 4 estado | Igual |
| Coordinador (invitación) | Nombre, teléfono, correo, contraseña, términos | Igual; al confirmar queda unido | Camiones y operadores de sus unidades | Lo de su empresa |
| Operador (invitación, app) | Nombre y teléfono prellenados, contraseña, términos | No aplica | INE, licencia, selfie | Viajes (D45) |

Campos para entrar: de 16–17 a **5** (más tipo y términos).

### 0.3 Olas y dependencias

| Ola | Bloques | Depende de |
|---|---|---|
| S-A | S1 🔒 (backend, plantillas de correo, esquemas y copy compartidos) | — |
| S-B | S2 (web) y S3 (app) en paralelo | S1 |
| S-C | S4 (cierre: E2E completos, dispositivos y documentación) | S2 y S3 |

Para no chocar en S-B: S1 deja en `packages/shared` los esquemas y la lógica pura que usan los dos (alta de un paso, lista "Completa tu cuenta", espera del reenvío); S2 solo edita `apps/web`, `copy/auth.ts` y `e2e/`; S3 solo `apps/mobile` (con `apps/mobile/.maestro/`) y `copy/mobile.ts`.

---

## 1. Lo que se reutiliza

- `register_company`, `/completar-registro` (web) y `company.tsx` (app): ya registran la empresa de una cuenta que no la tiene. Pasan a ser el paso 1 de "Completa tu cuenta"; **`companies` no cambia** (`legal_name` y `rfc` siguen obligatorios y el RFC único): mientras no hay datos fiscales, no hay empresa.
- `sign-up-steps.ts` y `onboarding.ts` de `@transport/shared` (pasos y qué le falta a cada perfil), `/cuenta-en-revision` y `(carrier)/onboarding.tsx`, `document-upload`.
- El comportamiento de la app con empresa sin aprobar (`CompanyStatus` y la tarjeta "Continuar mi alta", `ContinueOnboarding` en `home.tsx`) es el modelo para la web.
- `review_company`, el sistema de notificaciones (B16) y sus envíos.
- Plantillas `supabase/templates/confirmation.html` y `recovery.html`; `/auth/confirm`.

---

## 2. Bloques

#### S1 🔒 · Base: alta de un paso, código de confirmación y avisos (D42-E1, D15-E3, D50, D51)

- **Objetivo:** dejar listo lo compartido para que la web y la app simplifiquen el acceso sin tocarse.
- **Alcance:**
  - **Esquemas (`packages/shared/src/schemas/`):** el alta de un paso (tipo, nombre, teléfono, correo, contraseña, términos) a partir de los esquemas actuales; la contraseña nueva sin confirmación (alta, invitación de coordinador y operador, restablecer, restablecer acceso del operador); código de 6 dígitos. El alta **deja de mandar** `pending_company` en los metadatos; `registerPendingCompany` y su equivalente en la app se conservan para las cuentas que ya lo traen.
  - **Lógica pura:** la lista "Completa tu cuenta" por perfil (parte de `onboarding.ts`: agrega "datos fiscales" como primer pendiente cuando no hay empresa) y la espera entre reenvíos, con Vitest.
  - **Plantillas de correo:** `confirmation.html` y `recovery.html` muestran `{{ .Token }}` (6 dígitos) además del enlace; el enlace de confirmación deja de depender del dispositivo (enlace web con `token_hash` a `/auth/confirm`, que al terminar ofrece abrir la app). `config.toml` ya tiene `otp_length = 6` y `otp_expiry = 3600` en `[auth.email]`: se conservan y la vigencia del código queda documentada; la espera del reenvío respeta `max_frequency`.
  - **Avisos (D51):** tipos `company_approved` y `company_rejected` (enum en su propia migración); `review_company` ("Same as …, except …") notifica a los usuarios de la empresa, con el motivo en el rechazo; copy y destino del aviso en web y app.
  - **RFC repetido (D50-5):** `register_company` ya lo rechaza; el bloque asegura un código de error estable y su traducción al campo "RFC" (hoy llega como error general tras confirmar).
  - **Invitación del operador (D50-2):** hoy `invitations` solo guarda `invitee_name` y `invitation_preview` no devuelve teléfono. S1 agrega el teléfono opcional del invitado (columna en `invitations`, parámetro en `create_invitation` y campo en `invitation_preview`, solo para quien trae el token), normalizado con `normalize_mx_phone`, con pgTAP; el formulario de invitar lo captura en S2.
  - **INE del hombre-camión (D50-4):** si se puede reutilizar el archivo de `legal_representative_id` como `operator_official_id` del propio operador con una RPC `security definer` que valide dueño, empresa y tipo, y sin abrir rutas de Storage, se construye con pgTAP; si no, se explica en el PR y se queda la nota actual.
  - **Auditoría de D48 (solo lectura + pgTAP):** lista de RPC y políticas que usan las pantallas de `/cliente` y `/transportista`, con una prueba por cada una de que una empresa que no está `approved` (`pending_review`, `rejected`, `expired` o `suspended`) **no** publica, oferta, recibe recomendaciones ni asigna, y de que una cuenta sin empresa no lee ni escribe nada de otra. Lo que falte se cierra aquí.
- **Fuera de alcance:** pantallas (S2, S3); cambiar `companies`; SMS; CAPTCHA.
- **Tests:** pgTAP de los avisos, de la auditoría, del teléfono de la invitación y de la RPC de la INE si se construye; Vitest de esquemas y lógica; suite 18 (`supabase/tests/database/18_security_audit.test.sql`) y `supabase/seed-tests/security_matrix.test.sql` actualizadas.
- **Aceptación:** `supabase db reset` y `supabase test db` en verde; el correo local (Mailpit) muestra código y enlace; aprobar y rechazar una empresa deja el aviso.
- **Paso para Mateo:** las plantillas de correo y `otp_length` de producción se cambian en el panel de Supabase (el despliegue no las publica); S1 deja el texto exacto en [release.md](release.md).

#### S2 · Web: entrar en un paso y panel en revisión (D42-E1, D48, D15-E3, D50)

- **Objetivo:** que en la web se cree la cuenta en una pantalla, se confirme sin atorarse y se entre al panel de inmediato.
- **Alcance:**
  - `/registro`: una sola pantalla con el esquema de S1; sin indicador de cinco pasos; conserva los textos de perfil, "Únete con tu invitación" y los `autocomplete`. Sin "Confirma la contraseña" en registro, invitación y `/restablecer`.
  - `/verificar-correo`: campo para el código de 6 dígitos (`verifyOtp`), "Reenviar correo" con espera visible (`auth.resend`) y "Cambiar correo" (vuelve al registro con los datos). El inicio de sesión de una cuenta sin confirmar lleva a esta pantalla con el correo puesto.
  - **Entrar antes de aprobar (D48):** `homeFor` manda al cliente a `/cliente` y al Gerente y coordinador a `/transportista` aunque no haya empresa o no esté aprobada; se quita el bloqueo `HOME_ONLY` por estado (el de perfil se queda). `requireAccess` y los layouts dejan de exigir empresa aprobada para **ver**; cada página que necesita empresa muestra un estado vacío que lleva al paso pendiente.
  - **"Completa tu cuenta":** aviso fijo en el panel (kit Fulmis) con el avance y el siguiente pendiente, mientras falte algo o la empresa esté en revisión o rechazada. `/cuenta-en-revision` pasa a ser esa lista (misma ruta, pasos 1–4 de §0.2) con los datos fiscales como paso 1 (el formulario de `/completar-registro`, con el contacto prellenado de la cuenta y el RFC repetido en su campo). `/completar-registro` redirige ahí.
  - **Acciones bloqueadas:** "Publicar" (cliente) y ofertar o asignar (transportista) se muestran deshabilitadas con el motivo y el enlace al pendiente; el error de la RPC se traduce igual si se llega por otro camino. El cliente puede guardar la carga como borrador.
  - **Flota antes de aprobar:** `/transportista/empresa` y `/transportista/flota` abren con la empresa registrada sin aprobar.
  - **Coordinador (D50-3):** al volver de confirmar el correo con una invitación pendiente, `joinCompany` corre solo; "Unirme" queda para quien ya tenía sesión. Hoy el token de la invitación viaja en el `next` del enlace de confirmación (`redirect_to` en `/auth/confirm`); al confirmar con el **código** no hay enlace, así que `/verificar-correo` conserva ese `next` (validado con `safeNextPath`) y, tras `verifyOtp`, sigue a la invitación igual que el enlace.
  - **Invitar a un operador (D50-2):** el formulario de `/transportista/flota/operadores/invitar` suma el teléfono opcional que S1 agrega a la invitación.
  - Avisos de D51 en la campana y su destino.
- **Fuera de alcance:** la app (S3); el panel de marca; cambiar el flujo del admin.
- **Tests:** Vitest de `homeFor`/`resolveRoute` por perfil × (sin empresa, en revisión, rechazada, aprobada) y de la traducción de errores a pendientes.
- **Aceptación:** un cliente nuevo crea su cuenta con 5 campos, confirma con el código, entra a `/cliente`, captura sus datos fiscales, guarda un borrador y no puede publicarlo hasta que el admin aprueba; un Gerente arma su flota antes de la aprobación; reenviar funciona.
- **E2E** (`e2e/tests/`, `pnpm --filter @transport/e2e e2e`): los specs que registran o confirman una cuenta (`sign-up-steps`, `onboarding-steps`, `shipper-journey`, `invitations`) y los que dependen de adónde entra cada perfil o una empresa sin aprobar (al menos `profiles`, `manager-company`, `coordinator-operators`, `cargo-insurance`); uno nuevo para código, reenvío y panel en revisión, y la invitación de coordinador confirmada con código.

#### S3 · App: lo mismo, más recuperar la contraseña (D42-E1, D15-E3, D49, D50)

- **Objetivo:** el mismo recorrido en la app para Gerente, hombre-camión, coordinador y operador.
- **Alcance:**
  - `(auth)/sign-up.tsx` en una pantalla (esquema de S1); sin confirmación de contraseña en alta, invitación y restablecer acceso.
  - `CheckEmail`: código de 6 dígitos, "Reenviar correo" con espera y "Cambiar correo". `auth/callback.tsx` se conserva para enlaces viejos y, si falla, lleva a teclear el código. El inicio de sesión sin confirmar lleva a esa pantalla.
  - **"¿Olvidaste tu contraseña?" (D49):** correo → código → contraseña nueva; con la nota para el operador que solo tiene teléfono.
  - Área `company_setup`: el Gerente sin empresa entra a las pestañas con "Completa tu cuenta" (la tarjeta de `home.tsx`) en lugar de quedar en `company.tsx`; `company.tsx` es el paso 1, con el contacto prellenado y el RFC repetido en su campo. `(carrier)/onboarding.tsx` muestra los pasos de §0.2.
  - **Operador (D50-2):** `OperatorRedeem` prellena nombre y teléfono de la invitación (el teléfono llega por el campo que S1 agrega a `invitation_preview`; las invitaciones anteriores no lo traen y el campo queda vacío). El formulario de invitar de la app (`components/company-sections.tsx`) también captura el teléfono opcional.
  - **Coordinador (D50-3):** al confirmar con el token guardado, se une solo.
  - Avisos de D51 (push y lista).
- **Fuera de alcance:** el cliente en la app (D06-E1); biometría (Seguimiento).
- **Tests:** Vitest de `lib/routing.ts` por perfil y estado, y de la lógica nueva.
- **Aceptación:** en el simulador de iPhone: alta con 5 campos, confirmación con el código abierto en otro dispositivo, recuperación de contraseña completa, operador con datos prellenados.
- **E2E:** Maestro (`apps/mobile/.maestro/`) `08-operator-invite`, `09-manager-company`, `12-operator-phone`, `13-owner-operator-offer`, `20-terms-acceptance`, `24-carrier-sign-up-steps`, `25-carrier-sign-up-confirm`, los subflujos `sign-in`, `fill-new-password` y `fill-new-password-sheet`, y uno nuevo de recuperar contraseña.

#### S4 · Cierre

- **Objetivo:** comprobar el recorrido completo y dejarlo documentado.
- **Alcance:** `pnpm --filter @transport/e2e e2e` y `pnpm e2e:mobile` completos; capturas del recorrido de cada perfil en web (1440 y 390 px) e iPhone pequeño y grande, claro y oscuro; conteo real de pantallas y campos contra §0.2; actualizar [producto-v1.md](producto-v1.md), [demo-local.md](demo-local.md) y [seguridad.md](seguridad.md) (qué ve una empresa sin aprobar); nota en [plan-registro.md](plan-registro.md) de lo que D42-E1 reemplaza.
- **Fuera de alcance:** funciones nuevas.
- **Aceptación:** todo en verde y el conteo publicado en el PR.

---

## 3. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Abrir el panel deja hacer algo que antes tapaba la redirección | Auditoría con pgTAP en S1 antes de tocar la web; regla de §0.1: se corrige en el backend |
| Cuentas sin empresa que nunca terminan | "Completa tu cuenta" fijo en el panel; el admin ya ve las cuentas; recordatorios, en Seguimiento |
| El código de 6 dígitos se puede adivinar | Vigencia corta y límites de Supabase Auth por correo e IP; el bloqueo por cuenta de D46 sigue |
| Reenvíos topan el límite de correos | Espera visible entre envíos y mensaje claro al llegar al límite; el límite de producción depende del SMTP (paso para Mateo) |
| Las plantillas de producción no traen el código | Las pantallas aceptan código **y** enlace; el paso para Mateo va en S1 y en §4 |
| Cuentas a medio registrar con `pending_company` | Se conserva `registerPendingCompany`; prueba con una cuenta de ese tipo |
| JP pidió el registro por pasos | Los pasos siguen, adentro del panel; Mateo le avisa (D42-E1) |

## 4. Seguimiento (para Mateo y JP)

1. **Avisar a JP** de D42-E1 y D48 antes de desplegar S2/S3.
2. **Panel de Supabase de producción:** plantillas de confirmación y recuperación con el código, `otp_length = 6` y el límite de correos por hora del SMTP.
3. **Biometría** (Face ID / huella) para reabrir la app: no entra en esta ola.
4. **Entrar con código sin contraseña** (correo) o por SMS: depende del proveedor de SMS (D15-E2).
5. **Recordatorios** por correo a las cuentas que no terminan "Completa tu cuenta".
6. **Mensajes distintos** para invitación vencida, usada o inválida.
