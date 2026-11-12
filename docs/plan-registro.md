# Plan de acceso y registro (ola R)

Tercera ola sobre el acceso. Sale de la lista de JP "Mejoras pantalla inicio de sesión y crear tu cuenta" (2026-11-12), que Mateo aceptó y pidió construir con un workflow. Las decisiones están en [decisiones.md](decisiones.md), "Enmiendas del 2026-11-12": D42–D47, D10-E1, D15-E2 y D16-E3.

**Qué pidió JP**, resumido:

- **Registro por pasos** para no provocar abandonos: (1) tipo de usuario y cuenta; (2) datos fiscales y domicilio; (3) documentos comunes; (4) lo propio de cada perfil; (5) verificación. Indicador de progreso, regresar sin perder datos y sin guardar contraseñas de forma insegura, compatible con "guardar contraseña".
- **Textos:** perfiles más simples ("Soy transportista (Gerente)"), quién administra la cuenta de la empresa, "Nombre fiscal" y sin "Representante legal" para persona física, botón para mostrar u ocultar las contraseñas, errores en el campo exacto sin borrar lo demás.
- **Invitación:** "¿Tu empresa ya utiliza Transport? Únete con tu invitación", debajo de los perfiles y debajo de "¿Olvidaste tu contraseña?". Coordinador y Operador se unen a empresas que ya existen por un enlace (el Gerente invita al Coordinador y el Coordinador al Operador), registran solo sus datos personales y siguen en el paso 4. La invitación debe ser única, vencer y dar solo los permisos autorizados.
- **Documentos:** la revisión sigue manual, pero lista para hacerse automática después; poder de representación y selfie propia; **ningún camión ni operador hace viajes sin sus documentos obligatorios aprobados y vigentes**.
- **Seguridad:** acceso por perfil al panel correcto, control de intentos, sesiones seguras y autenticación reforzada para administradores.
- **Dispositivos:** pruebas en iPhone y Android para ajustar visibilidad y espacios.

Quedan fuera de esta ola: el número de soporte (ya se cambió en producción con el ajuste `support.whatsapp`, D41), el mensaje y los tres beneficios del panel izquierdo del acceso (JP: "por ahora dejarlo así como preliminar") y las preguntas de contrato, primer pago y términos, que atiende Mateo.

**Qué ya existe en `main`** (auditado el 2026-11-12):

| Tema | Hoy |
|---|---|
| Inicio de sesión | "Correo o teléfono" + contraseña en la web y la app. El teléfono se traduce a un correo interno sintético (`packages/shared/src/phone.ts`, D15-E1). No hay SMS ni OTP. El correo se confirma con enlace; el teléfono no se verifica |
| Redirección por perfil | Web: `homeFor` y `resolveRoute` en `apps/web/src/lib/routing.ts`, aplicados por `proxy.ts` (optimista) y `requireAccess` en `lib/session.ts` (autoritativo). App: `apps/mobile/src/lib/routing.ts` manda al cliente y al admin a `/unsupported` |
| Seguridad del acceso | Solo los límites de Supabase por IP (`[auth.rate_limit]`). Sin bloqueo por cuenta ni CAPTCHA. Sesión de 1 h con refresh rotativo, sin duración máxima ni inactividad. **Sin MFA**: `[auth.mfa.totp]` está apagado en `supabase/config.toml` y nadie lo usa |
| Registro web | `/registro` en una sola página: tipo, datos, fiscales y domicilio, términos. La empresa viaja en los metadatos del alta y se registra al confirmar el correo (`registerPendingCompany`). Los documentos se suben después en `/cuenta-en-revision`. Persona física no cambia etiquetas; sin botón para mostrar la contraseña; errores por campo con aviso; se conservan los valores salvo las contraseñas; `autocomplete` `new-password`/`current-password` ya puestos |
| Registro en la app | Solo transportista y hombre-camión (`(auth)/sign-up.tsx`); los datos fiscales van después, en `company.tsx` |
| Copy | Perfiles y acceso en `packages/shared/src/copy/auth.ts`; la app, en `copy/mobile.ts` |
| Invitaciones (G1b) | `supabase/migrations/20261027000100_invitations.sql` y la Edge Function `redeem-invitation`: token aleatorio de 32 bytes guardado como hash único, vence a los 7 días (1–720 h), un solo uso, rol y unidades de negocio. La web abre `/invitacion/[token]` (Coordinador y Operador) pero **no tiene entrada** desde el login ni el registro ni pantalla para pegar el enlace. La app tiene "Tengo un enlace de invitación" (`invitacion/index.tsx`, con `parseInvitationLink` de `@transport/shared`) |
| Documentos | Catálogo `document_requirements` (D12, D16, D16-E2): empresa (CSF; identificación del representante, opcional para el cliente; póliza de la mercancía del cliente); camión (tarjeta de circulación, seguro, permisos); operador (identificación oficial y licencia). No hay poder ni selfie. Revisión manual en `/admin/verificacion` (`review_document`, `review_company`). Solo el cliente o el transportista de la empresa suben archivos; el operador no |
| Candado de viajes | `assign_trip` (versión vigente en `20261030000100_vehicle_release.sql`) rechaza empresa no aprobada, camión con documentos **vencidos** (`vehicle_expired_requirements`) y licencia no vigente. `match_pairs` ya excluye camiones sin todos sus documentos obligatorios aprobados y vigentes (`vehicle_missing_requirements`); `set_vehicle_availability` solo rechaza los vencidos. Huecos: (1) un camión al que le **falta** un documento obligatorio sí se asigna; (2) `operator_license_current` acepta la fecha `operators.license_expires_on` tecleada sin documento aprobado; (3) la identificación del operador no se revisa al asignar |

---

## 0. Cómo se ejecuta

### 0.1 Reglas comunes

- **Ciclo y gate:** el de [plan-v1.md §0.1](plan-v1.md) (rama `v1/<ID>-<slug>`, un PR por bloque, gate D14 con Greptile). Los bloques 🔒 piden la revisión de Greptile con foco en seguridad (RLS, Storage, `security definer`, sesiones) y corren `/security-review` antes de abrir el PR.
- **UI:** con el kit Fulmis ([plan-fulmis.md](plan-fulmis.md) §1) y sus reglas de forma de §0.4: un solo primario por pantalla y siempre visible, sin sombras ni valores sueltos, contraste AA, estado nunca solo con color, tema oscuro revisado, capturas claro/oscuro en `assets/<ID>-screenshots` (web a 1440 y 390 px; app en el simulador de iPhone) con el entorno local y los datos de `supabase db reset`. El acceso conserva la pantalla partida de V2 y el panel de marca **no cambia** (texto preliminar). Los bloques de esta ola pueden agregar piezas en archivos propios; si tocan un componente del kit (`components/ui/`, `components/ui.tsx`), lo dicen en el PR y no cambian su API para otras pantallas.
- **Backend:** autorización en Postgres. Tabla nueva con RLS y pgTAP de la matriz rol × operación × otra empresa en la misma migración; transiciones solo por RPC; `security definer` con `search_path` fijo, validación explícita del que llama y revocada de `public`/`anon`; la suite 18 (inventario) y la matriz `security_matrix` se actualizan, no se relajan. Las reglas G.0 de [plan-v1.md](plan-v1.md) siguen ("Same as <bloque>, except …" al recrear funciones, enums en su propia migración, rol literal). Migraciones con marca de tiempo posterior a la última de `main` al hacer merge; `pnpm db:types` si cambia el esquema.
- **Copy:** todo texto nuevo en `packages/shared/src/copy/` (web y compartido en `auth.ts`; la app en `mobile.ts`; R5 en un archivo propio, `auth-security.ts`, para no chocar con R1). Los textos que JP dictó se usan tal cual.
- **Contraseñas:** nunca en `localStorage`, `sessionStorage`, `AsyncStorage`, `SecureStore`, cookies, URL ni registros. El estado de un formulario por pasos vive en memoria del componente; si la página se recarga, la contraseña se vuelve a escribir.
- **E2E:** Playwright (`e2e/tests`) y Maestro (`apps/mobile/.maestro`) localizan por rol, texto y `accessibilityLabel`. Los nombres accesibles que ya existen se conservan ("Correo o teléfono", "Contraseña", "Confirma la contraseña", "Entrar", "Crear cuenta"…); el botón de mostrar u ocultar va **fuera** del `<label>` para no cambiar el nombre del campo, con nombre propio ("Mostrar contraseña" / "Ocultar contraseña") y `aria-pressed`. Cuando un bloque cambia un nombre o agrega un paso, actualiza los flujos afectados **en el mismo PR**.
- **Superficies (D06-E1), sin cambio:** el cliente solo en la web; el operador solo en la app (si abre su invitación en la web, crea su cuenta ahí y sigue en la app, como hoy); Gerente y Coordinador en la web y la app; el hombre-camión en la app y en la web (es Gerente, D13); el admin solo en la web.
- **Sin recursos en la nube:** ningún bloque crea cuentas ni cambia la configuración de Auth ni los secretos del proyecto de producción. Lo que lo necesite queda como paso para Mateo en el PR, en [seguridad.md](seguridad.md) y en §4.

### 0.2 El alta por perfil (D42, D43)

| Perfil | Entra por | 1 · Cuenta | 2 · Datos fiscales | 3 · Documentos comunes | 4 · Su perfil | 5 · Verificación |
|---|---|---|---|---|---|---|
| Cliente | Registro web | Tipo, nombre, teléfono, correo, contraseña | Razón social o nombre fiscal, RFC, domicilio, representante (solo moral) | CSF, INE del titular o representante, poder si aplica | Póliza de la mercancía (D35-E1); "información de sus cargas" por definir (D47) | Estado de cada documento |
| Gerente | Registro web o app | Igual | Igual | Igual | Unidades de negocio e invitaciones a coordinadores | Igual |
| Hombre-camión | Registro web o app | Igual | Igual | Igual | Su camión (tarjeta de circulación, seguro, permisos) y, como su propio operador, su identificación oficial, su licencia y su selfie | Igual, con los del camión y los suyos |
| Coordinador | Invitación del Gerente (web o app) | Nombre, teléfono, correo, contraseña | — | — | Camiones de sus unidades con sus documentos; operadores con nombre (invitaciones) | Estado de los documentos de sus camiones y operadores |
| Operador | Invitación del Gerente o Coordinador | Nombre, teléfono, contraseña; correo opcional (D15-E1) | — | — | INE, licencia vigente y selfie (en la app) | Estado de sus documentos |

### 0.3 Olas y dependencias

| Ola | Bloques | Depende de |
|---|---|---|
| R-A | R1 (web), R4 🔒 (candado), R5 🔒 (seguridad) en paralelo | — |
| R-B | R2 (app) | R1 (copy y esquemas compartidos) |
| R-C | R3 🔒 (pasos 3–5, web y app; se puede dividir en R3a web + backend y R3b app) | R2, y R4 en `main` (el candado y el origen de la revisión) |
| R-D | R6 (dispositivos) | todos |

Para no chocar en R-A: R1 edita `auth-forms.tsx`, las páginas de `(auth)/login` y `(auth)/registro`, `copy/auth.ts` y los esquemas de `schemas/auth.ts`; R5 no los edita: agrega sus pantallas y su copy en archivos propios y engancha el segundo factor en `routing.ts`, `proxy.ts`, `session.ts` y la acción de inicio de sesión. R4 solo toca migraciones, pgTAP y los mensajes de error de asignación. Si dos bloques tocan `routing.ts`, el segundo en hacer merge rebasa.

### 0.4 Definición de terminado (además de plan-v1.md §0.3)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`; con esquema: `supabase db reset`, `supabase test db` y `pnpm db:types` en verde.
- UI: las reglas de forma de [plan-fulmis.md](plan-fulmis.md) §0.4 y capturas claro/oscuro en `assets/<ID>-screenshots`.
- E2E de la zona en verde (Playwright y, si se tocó la app, Maestro).
- Ningún secreto ni teléfono personal en el repo; variables nuevas en `.env.example`.

---

## 1. Lo que se reutiliza

- Esquemas de validación de `packages/shared/src/schemas/auth.ts` (`registrationSignUpSchema` y compañía): los pasos validan su parte con el mismo esquema (por ejemplo con `.pick`), sin reglas nuevas.
- El alta con la empresa en los metadatos y `registerPendingCompany` al confirmar el correo (web); `register_company` en Postgres.
- `parseInvitationLink`, `invitationUrl` e `invitationDeepLink` (`packages/shared/src/invitation-link.ts`); `/invitacion/[token]` en la web y `invitacion/[token].tsx` en la app; `create_invitation` e `invitation_preview`.
- Documentos: `submit_document`, `review_document`, el bucket `documents`, `components/document-upload.tsx` (web), las pantallas de documentos de la app y `/cuenta-en-revision`.
- Flota y empresa: `/transportista/empresa` y `/transportista/flota` (web), `my-company.tsx`, `operators.tsx`, `invite-operator.tsx`, `vehicle/[id].tsx` (app).
- Readiness: `vehicle_missing_requirements`, `vehicle_expired_requirements`, `company_missing_requirements`.

---

## 2. Bloques

Formato: objetivo, alcance, fuera de alcance, tests, aceptación y E2E afectados. Un PR por bloque; gate D14.

#### R1 · Registro web por pasos y acceso (D42, D43)

- **Objetivo:** que crear una cuenta en la web sean dos pasos cortos con progreso, sin perder lo capturado, y que quien ya tiene empresa encuentre su invitación.
- **Alcance:**
  - `/registro` en pasos dentro de un solo componente cliente: **paso 1** (tipo de usuario, nombre, teléfono, correo, contraseña y confirmación) y **paso 2** (datos fiscales y domicilio, aceptación de términos y "Crear cuenta"). Indicador de progreso con los cinco pasos de D42 (`steps` del kit), con el actual marcado y los pasos 3–5 como siguientes. "Regresar" vuelve al paso 1 con todo lo capturado. El envío final usa la misma acción `signUp` y la misma carga útil de hoy.
  - Estado en memoria; contraseñas nunca en almacenamiento (§0.1). Los campos del paso 1 siguen montados (ocultos) durante el paso 2, así el envío final incluye `username` y `new-password` y el gestor de contraseñas ofrece guardarla. El paso 1 se valida en el cliente con el mismo esquema antes de avanzar.
  - Errores: cada error va en su campo y el formulario no borra lo demás. Si el servidor rechaza un campo de un paso anterior (correo ya registrado, teléfono inválido, contraseña débil), el formulario vuelve a ese paso con el foco y el error en el campo. El aviso general se queda para lo que no es de un campo.
  - Botón mostrar/ocultar en "Contraseña" y "Confirma la contraseña" del registro, en la contraseña del login y en las de restablecer.
  - Persona física: "Razón social" → "Nombre fiscal" y sin "Representante legal" (el valor no se envía; el backend ya lo exige solo a la persona moral). Se aplica también en `/completar-registro`.
  - Copy (`copy/auth.ts`): perfiles "Soy cliente: necesito transportar mercancía", "Soy transportista (Gerente): tengo camiones y busco cargas", "Soy hombre-camión: dueño y operador de mi camión"; al elegir Gerente, "Posteriormente podrás invitar y administrar a los colaboradores de tu empresa."; rótulo "Nombre fiscal"; nombres de los pasos.
  - Invitación: "¿Tu empresa ya utiliza Transport? Únete con tu invitación" debajo de las opciones de perfil (registro) y debajo de "¿Olvidaste tu contraseña?" (login). Lleva a una pantalla nueva `/invitacion` (sin token) para pegar el enlace: un campo, `parseInvitationLink` y redirección a `/invitacion/[token]`; un enlace inválido se dice en el campo. Misma regla de acceso que `/invitacion/[token]` en `routing.ts`.
- **Fuera de alcance:** pasos 3–5 (R3); la app (R2); MFA y bloqueo (R5); cambiar qué datos pide el alta o su validación; el panel de marca.
- **Tests:** Vitest de la lógica pura del formulario por pasos (qué paso tiene un campo con error, qué campos valida cada paso, etiquetas por tipo de persona) y de la pantalla de pegar enlace; prueba de que ningún código del registro escribe en `localStorage`/`sessionStorage`.
- **Aceptación:** un registro completo en dos pasos con regreso sin pérdida; persona física sin "Representante legal"; un correo repetido devuelve al paso 1 con el error en "Correo electrónico" y los demás datos intactos; el navegador ofrece guardar la contraseña al crear la cuenta; desde el login y el registro se llega a pegar una invitación.
- **E2E:** `profiles`, `shipper-journey`, `invitations`, `manager-company` y cualquier spec que registre una cuenta (paso 1 → "Siguiente" → paso 2). Un spec nuevo o ampliado para el regreso sin pérdida y para pegar una invitación.

#### R2 · Registro por pasos en la app (D42, D43)

- **Objetivo:** lo mismo que R1 para el transportista y el hombre-camión en la app.
- **Alcance:**
  - `(auth)/sign-up.tsx` por pasos con indicador (`Steps` del kit móvil): paso 1 (tipo, nombre, teléfono, correo, contraseña y confirmación) y paso 2 (datos fiscales y domicilio, términos). Como en la web, la empresa viaja en los metadatos del alta y se registra al confirmar el correo; `company.tsx` queda para completar una cuenta sin empresa, con las mismas etiquetas. Si el bloque encuentra que la app no puede seguir ese camino, conserva `company.tsx` como paso 2 tras confirmar el correo con el mismo indicador y lo explica en el PR.
  - Estado en memoria; contraseñas fuera de todo almacenamiento; `textContentType`/`autoComplete` (`username`, `newPassword`, `password`) para que iOS y Android ofrezcan guardar la contraseña.
  - Mostrar/ocultar en las contraseñas del registro, del login y de la invitación.
  - Persona física: "Nombre fiscal" y sin "Representante legal".
  - Copy (`copy/mobile.ts`, reutilizando los textos de R1 en `copy/auth.ts` donde ya existan): perfiles "Soy transportista (Gerente)…" y "Soy hombre-camión…", texto del Gerente.
  - Invitación: "Tengo un enlace de invitación" pasa a "¿Tu empresa ya utiliza Transport? Únete con tu invitación" y se coloca debajo de "¿Olvidaste tu contraseña?" (login) y debajo de los perfiles (registro). La pantalla `invitacion/index.tsx` no cambia de lógica.
  - Errores en su campo, con desplazamiento al campo y sin borrar lo demás.
- **Fuera de alcance:** el cliente en la app (D06-E1); pasos 3–5 (R3); ajustes por tamaño de pantalla (R6).
- **Tests:** Vitest de la lógica de pasos de la app (si no se comparte con R1).
- **Aceptación:** igual que R1 en el simulador de iPhone; el teclado no tapa el primario (barra inferior fija del kit).
- **E2E:** Maestro `08-operator-invite`, `12-operator-phone`, `20-terms-acceptance` y el subflujo `sign-in` si cambia el texto de la invitación.

#### R3 🔒 · Pasos 3, 4 y 5 del alta (D42–D44, D47, D16-E3)

- **Objetivo:** que después de crear la cuenta cada perfil vea qué le falta, lo suba en orden y sepa en qué va su verificación.
- **Alcance:**
  - **Catálogo (migración de datos, sin borrar filas):** `power_of_attorney` ("Poder o documento de representación", empresa, opcional, para cliente y transportista); `operator_selfie` ("Selfie", operador, obligatorio, privado, `shareable_with_shipper = false`, sin vigencia); `legal_representative_id` pasa a llamarse "INE del titular o representante legal" y deja de ser opcional para el cliente (`optional_for` sin `shipper`, D16-E3). Las empresas aprobadas siguen aprobadas.
  - **Paso 3 (web y app):** CSF, INE del titular o representante y poder si aplica, con `document-upload` y el estado de cada uno.
  - **Paso 4 por perfil:** cliente, la póliza de la mercancía y una nota de que los datos de cada carga se capturan al publicarla (D47); Gerente, unidades de negocio e invitar coordinadores (enlaza o incrusta lo de "Mi empresa"); Coordinador (llega por invitación sin pasos 2–3), camiones de sus unidades con sus documentos y operadores con nombre e invitación; Operador (por invitación, en la app), INE, licencia vigente y selfie con la cámara frontal; hombre-camión, su camión, seguro y permisos y, como su propio operador (D13), su identificación oficial (`operator_official_id`), licencia y selfie. La INE del paso 3 es un documento de la empresa (`legal_representative_id`) y no cumple el requisito del operador: el paso 4 la pide como documento del operador; si el bloque puede reutilizar el archivo del paso 3 sin debilitar las validaciones de ruta de `submit_document` y Storage, lo ofrece; si no, la pide con la nota "la misma INE del paso 3".
  - **Paso 5 "En verificación":** `/cuenta-en-revision` en la web y su equivalente en la app con el estado de cada documento (pendiente, en revisión, aprobado, rechazado con motivo, vencido) y qué hacer.
  - **El operador sube sus propios documentos:** política de Storage y `submit_document` le permiten subir y leer **solo** los documentos `owner_type = 'operator'` de su propia fila de `operators`, en su empresa; nada de la empresa, de los camiones ni de otros operadores. Por eso el bloque es 🔒.
  - Las invitaciones de Coordinador y Operador terminan en el paso 4 de su perfil.
  - El admin ve la selfie junto a la identificación en `/admin/verificacion` (revisión manual, D44).
- **Fuera de alcance:** el revisor automático; reconocimiento facial; "información de sus cargas" más allá de la nota (D47, pregunta para JP); cambiar reglas de aprobación de empresas.
- **Tests:** pgTAP del catálogo (filas nuevas y `optional_for`), de `submit_document` y Storage para el operador (sube lo suyo; no sube ni lee lo de otro operador, del camión ni de otra empresa) y de la matriz de seguridad; Vitest de la lógica que decide el paso actual y lo que falta por perfil.
- **Aceptación:** cada perfil de §0.2 llega del paso 1 (o de la invitación) al 5 con capturas en web y app; un operador sube su selfie desde la app y el admin la aprueba o rechaza.
- **E2E:** `profiles`, `invitations`, `coordinator-operators`, `manager-company`, `cargo-insurance`, `shipper-journey`; Maestro `08-operator-invite`, `09-manager-company`, `12-operator-phone`, `13-owner-operator-offer`.
- **Tamaño:** si pasa de ~800 líneas, R3a (catálogo, Storage, RPC y web) y R3b (app).

#### R4 🔒 · Candado de viajes (D45, D10-E1)

- **Objetivo:** que ningún camión ni operador sin todos sus documentos obligatorios aprobados y vigentes pueda tomar un viaje.
- **Alcance:**
  - Funciones internas de readiness para el operador, como las del camión: `operator_missing_requirements(operator)` y `operator_expired_requirements(operator)` desde el catálogo (todo lo obligatorio de `owner_type = 'operator'`: identificación, licencia y, cuando R3 la agregue, la selfie, sin cambiar código).
  - `assign_trip` ("Same as G5, except …"): rechaza un camión con documentos **faltantes** además de vencidos (hueco 1); la licencia vigente sale **solo** del documento aprobado y vigente, ya no de `license_expires_on` tecleada (hueco 2; la columna queda informativa); exige la identificación del operador aprobada (hueco 3) y lo demás obligatorio del operador. Errores `55000` con el código del documento que falta, sin revelar filas de otra empresa.
  - Mismo criterio donde se ofrece o habilita: `set_vehicle_availability` rechaza también los faltantes (hoy solo los vencidos); `match_pairs`/`match_candidates` ya usan `vehicle_missing_requirements` y se cubren con pgTAP; el camino del hombre-camión (su operador propio) usa la readiness del operador. El bloque busca cualquier otra RPC que deje un camión u operador listo para viajar y la cubre, o la lista en el PR.
  - **Origen de la revisión (D10-E1):** `documents.review_source` (`manual` | `automatic`, enum propio, `manual` por defecto y en las filas existentes) que fija `review_document`; columna `document_requirements.auto_review_eligible boolean default false` en el catálogo. Ninguna RPC escribe `automatic` todavía.
  - Mensajes claros en web y app (copy en `copy/`): al asignar, "Falta aprobar: Tarjeta de circulación" o "La licencia de <operador> venció"; en flota, qué camión u operador no puede viajar y por qué.
- **Fuera de alcance:** la selfie y el poder (R3); el revisor automático; documentos del viaje (D22, no bloquean salvo su configuración).
- **Tests:** pgTAP por caso: camión con un documento faltante, con uno vencido, con uno rechazado; operador sin licencia aprobada pero con fecha tecleada; operador sin identificación; operador completo (control); hombre-camión; recomendaciones y disponibilidad con los mismos casos; `review_source` en la matriz. Vitest de cualquier traducción de error a mensaje.
- **Aceptación:** los tres huecos cerrados con su prueba; la seed sigue permitiendo los flujos E2E (los camiones y operadores de la seed tienen sus documentos aprobados; si no, la seed se completa en el mismo PR).
- **E2E:** `carrier-web-trips-fleet`, `trip-cancel-release`, `coordinator-operators`; Maestro `03-carrier-assign`, `10-coordinator-release`, `14-owner-operator-trip`.

#### R5 🔒 · Seguridad del acceso (D46)

- **Objetivo:** que un admin no entre con solo su contraseña, que una cuenta no se pueda atacar sin límite y que las sesiones tengan fin.
- **Alcance:**
  - **Segundo factor para admins (TOTP de Supabase Auth, nivel `aal2`):**
    - `supabase/config.toml`: `[auth.mfa.totp]` con `enroll_enabled` y `verify_enabled` en `true` (local y CI).
    - Web: después de entrar, un admin en `aal1` va a una pantalla propia: **inscripción** (QR y clave para la app autenticadora, confirmar con un código) si no tiene factor, o **desafío** (código de 6 dígitos) si ya lo tiene. `resolveRoute`/`proxy.ts`/`requireAccess` exigen `aal2` para `/admin/**` (el nivel se lee de la sesión con `auth.mfa.getAuthenticatorAssuranceLevel`); esas pantallas se permiten en `aal1` para que **Mateo, admin en producción, pueda inscribirse en su primer ingreso** sin quedarse fuera.
    - Postgres: `is_admin()` ("Same as B01, except …") exige además `auth.jwt() ->> 'aal' = 'aal2'`; así todas las RLS y RPC de admin lo piden sin tocarlas una por una. El bloque revisa los usos de `is_admin()` donde el `false` abre algo (no debería haber) y las Edge Functions que comprueban el rol por su cuenta.
    - App: el admin ya va a `/unsupported`; con `aal1` sus llamadas de admin fallan por `is_admin()`.
    - Recuperación: Supabase no da códigos de respaldo. [seguridad.md](seguridad.md) documenta registrar un segundo factor de respaldo y cómo Mateo borra el factor de un admin desde el panel de Supabase si lo pierde.
    - Seed y E2E: el admin demo tiene un factor TOTP verificado con una clave **de prueba** de la seed (solo local, documentada en [demo-local.md](demo-local.md)) y `signInOnWeb` de Playwright calcula el código con un helper RFC 6238 propio (con test). Los helpers de pgTAP que simulan al admin agregan `aal = aal2` a sus claims.
  - **Bloqueo por cuenta:** la única forma autoritativa es el *Password Verification Attempt Hook* de Supabase Auth, que en Supabase alojado solo existe en los planes Team y Enterprise. El bloque escribe la función del hook en Postgres (cuenta los fallos por usuario en una tabla con RLS y sin acceso de clientes; tras N fallos seguidos rechaza durante M minutos; N, M y la ventana documentados) con pgTAP, la activa en `config.toml` local y traduce su rechazo a un mensaje en el login web y en la app. Activarlo en producción es paso para Mateo (plan y panel). No se agrega ninguna RPC anónima para contar fallos (permitiría bloquear cuentas ajenas y adivinar si existen). Sin el hook, quedan los límites por IP y, para los admins, el segundo factor.
  - **Sesiones desde el código:** la web cierra la sesión del admin tras una duración máxima y tras un tiempo de inactividad (propuesta: 8 h y 30 min), leyendo la hora de inicio de sesión de la propia sesión (`amr`) y una cookie `httpOnly` de última actividad que refresca `proxy.ts`; para los demás perfiles, una duración máxima larga (propuesta: 30 días) que no corte a un transportista en carretera. Los valores viven en una constante compartida con test. `timebox` e `inactivity_timeout` de Supabase (plan Pro o superior, en el panel) son paso para Mateo.
  - **Redirección por perfil:** pruebas de `homeFor`/`resolveRoute` para cada perfil y estado (incluido el admin en `aal1`) y de la app.
  - [seguridad.md](seguridad.md): sección nueva con el modelo, lo que se activó en código, los pasos para Mateo y la revisión de `is_admin()`.
- **Fuera de alcance:** MFA para perfiles que no son admin; SMS (D15-E2); CAPTCHA (necesita cuenta con un proveedor: §4); cambiar la configuración de Auth de producción.
- **Tests:** pgTAP de `is_admin()` con `aal1` y `aal2` sobre una muestra de RPC y tablas de admin, del hook (cuenta, bloquea, vence, se reinicia con un acierto) y del inventario de la suite 18; Vitest de la ruta por nivel de autenticación, de la política de sesión y del helper TOTP.
- **Aceptación:** un admin sin factor se inscribe en su primer ingreso y entra; uno con factor no entra a `/admin` ni llama una RPC de admin sin el código; un admin inactivo 30 min vuelve al login; los demás perfiles no notan cambios.
- **E2E:** todos los que entran como admin (`brokered-load`, `cargo-insurance`, `freight-invoices`, `freight-ledger`, `quick-pay`, `road-intelligence`, `shipper-journey`, `subscription`, `support-help`) pasan por el desafío TOTP con el helper; uno nuevo para la inscripción.

#### R6 · Revisión en dispositivos

- **Objetivo:** que el acceso y el registro se vean y se usen bien en teléfonos pequeños y grandes.
- **Alcance:** la app en el simulador de iPhone pequeño (p. ej. iPhone SE) y grande (p. ej. Pro Max), en claro y oscuro: login, registro por pasos, invitación, pasos 3–5 y la inscripción de documentos con cámara. Ajustar espacios, visibilidad, tamaño de texto dinámico, teclado (que no tape el campo activo ni el primario) y zonas seguras. Android en el emulador **solo si** la Mac ya tiene Android SDK y un emulador instalados: no se descargan ni se instalan SDKs (en la auditoría del 2026-11-12 no había `adb` ni `emulator`). Sin Android, queda como paso para Mateo con una lista de qué revisar.
- **Fuera de alcance:** teléfonos físicos (paso para Mateo y JP), pantallas fuera del acceso y el alta.
- **Tests:** los de la zona; capturas por tamaño.
- **Aceptación:** capturas en los dos tamaños de iPhone (y Android si hubo emulador) sin cortes, solapes ni primario tapado por el teclado.
- **E2E:** los de Maestro del acceso (`08`, `12`, `20` y el subflujo `sign-in`).

---

## 3. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Al exigir la selfie y la identificación aprobadas (R3 + R4), los operadores que ya están en producción quedan sin poder asignarse | Antes de desplegar R3, avisar a JP para que sus operadores suban la selfie y el admin revise; el PR de R3 lista cuántos quedarían bloqueados con los datos de la seed y deja el aviso en "Seguimiento" |
| Mateo pierde el acceso al panel al activar el segundo factor | Inscripción permitida en `aal1` en el primer ingreso; factor de respaldo documentado; si pierde el teléfono, se borra su factor desde el panel de Supabase (seguridad.md) |
| El bloqueo por cuenta permite que alguien bloquee una cuenta ajena a propósito | Bloqueo temporal (minutos, no permanente), un acierto lo reinicia, sin RPC anónima; el admin queda protegido por TOTP aunque lo bloqueen |
| El hook de contraseña o la duración de sesión del servidor no están en el plan de Supabase de producción | Lo autoritativo queda como paso para Mateo; la web aplica la duración e inactividad desde el código mientras tanto |
| Los gestores de contraseñas no ofrecen guardar en un formulario por pasos | Campos del paso 1 montados en el envío final con sus `autocomplete`; se prueba en Safari, Chrome y en iOS |
| PR paralelos de R-A chocan en el acceso | Archivos repartidos en §0.3; R5 con copy propio |
| Los E2E de admin se rompen con el TOTP | Factor de prueba en la seed y helper TOTP en el mismo PR (R5) |
| R3 crece de más | División R3a/R3b |

## 4. Seguimiento (para Mateo y JP)

1. **SMS:** el teléfono no se verifica hasta contratar un proveedor de SMS (costo por mensaje). Decidir proveedor y cuándo (D15-E2).
2. **"Información de sus cargas"** en el paso 4 del cliente: ¿qué datos quiere JP (tipos de carga habituales, volumen, rutas…)? Hasta definirlo, solo la póliza (D47).
3. **Configuración de Auth en producción (Mateo, en el panel de Supabase):** confirmar que "Authenticator app (TOTP)" sigue activo en MFA; activar el *Password Verification Attempt Hook* si el plan lo permite (Team o Enterprise); `timebox` e `inactivity_timeout` de sesión si el plan lo permite (Pro o superior). R5 deja los valores exactos.
4. **Pruebas en teléfonos reales** (iPhone y Android de JP y de algún operador) y, si no había emulador, la revisión en Android de R6.
5. **Revisor automático de documentos:** qué documentos y con qué servicio (OCR, validación del RFC en el SAT, vigencia); el modelo queda listo con D10-E1.
6. **Operadores que ya existen:** avisar a JP antes de desplegar R3 para que suban la selfie (§3).
7. **CAPTCHA** en el login y el registro: necesita cuenta con un proveedor (hCaptcha o Turnstile); decidir si se quiere.
8. **Panel izquierdo del acceso:** JP lo dejó como preliminar; cuando lo redacte, es solo copy.
