# Plan de UI/UX: "Fulmis" (ola V)

Segunda ola visual. Sustituye el sistema "Transport · Nativo" ([plan-rediseno.md](plan-rediseno.md), D26) por la dirección **C · Fulmis**, que Mateo eligió el 2026-11-11 entre tres propuestas (D26-E2 en [decisiones.md](decisiones.md)). A diferencia de la ola U, esta ola **sí cambia navegación, densidad y jerarquía**, no solo la piel.

Origen: la auditoría de UI/UX del 2026-11-11 sobre producción (web pública, cliente, transportista, admin y app). Lo que encontró, resumido:

- **Marca:** sin identidad; el producto se ve como una plantilla.
- **Superficies:** planas y de bajo contraste; escala de teléfono en escritorio, poca densidad, contenedor de 1040 px.
- **Navegación:** pestañas de texto que se desbordan (9 en transportista, 12 en admin), sin barra lateral ni contadores.
- **Inicios:** son menús, no tableros; no dicen qué requiere atención.
- **Acciones:** el primario queda escondido (aceptar, contraofertar y rechazar como filas plegables; "Publicar carga" a ~1,900 px de scroll; acciones del admin sin confirmación).
- **Estados y cifras:** tonos de estado que chocan entre sí; el precio nunca destaca; `.00` en todos los importes.
- **Detalle y listas:** páginas de detalle interminables; tablas débiles; controles nativos sin estilo; sin `loading.tsx`; vacíos pobres.
- **App:** el viaje del operador no tiene una acción siguiente inconfundible; ~20 % de la pantalla es cromo inferior; reportar una incidencia queda a 6–8 pantallas de scroll; un solo color para todos los avisos; las barras de cristal dejan ver el contenido; Cobranza sin cifra principal.

---

## 0. Cómo se ejecuta

### 0.1 Qué reabre respecto a la ola U

La ola U congeló textos, rutas y navegación y fijó reglas de forma. D26-E2 reabre solo lo de esta tabla; lo que no aparece aquí sigue como estaba.

| Regla de la ola U | Regla de la ola V |
|---|---|
| Hanken Grotesk como única familia | **Geist** (texto y títulos) y **Geist Mono** (etiquetas y metadatos) |
| Página neutra cálida, celdas blancas, acento azul `#1F5EFF` | **Paper** (claro) y **Night** (oscuro) de Fulmis; acento naranja señal `#e5630b` (§1.1) |
| Botones en píldora (radio 999); celdas 16; campos 12 | Botones 8; campos, chips y elementos de navegación 3; tarjetas, tablas y hojas 0; 999 solo en píldoras de estado, avatares e interruptores |
| Sin sombras, salvo la barra de pestañas flotante y el segmento seleccionado | **Sin sombras, sin excepciones.** La barra de pestañas es sólida con una línea fina; el segmento seleccionado se marca con relleno |
| Barras de cristal (blur) | Barras sólidas; los tokens `glass` y `glassLine` desaparecen |
| Web: pestañas de texto arriba, contenedor de 1040 px | Web: **barra lateral** Night de 240 px y contenido fluido hasta 1320 px (§1.5) |
| Navegación entre pantallas congelada | Se reagrupa la navegación y los inicios pasan a ser tableros. **Las rutas (URL) no cambian** |
| Copy congelado | Se permite copy **nuevo** (grupos de navegación, tableros, vacíos, confirmaciones) y retocar el existente solo cuando un bloque lo liste. Sigue viviendo en `packages/shared/src/copy/` |
| Un solo primario por pantalla | Se mantiene, y además debe estar **siempre visible** sin hacer scroll |

### 0.2 Qué no cambia

- Backend: esquema, RLS, RPC, Edge Functions y transiciones. Esta ola no agrega tablas ni migraciones. Un tablero solo muestra cifras que ya se pueden leer con las consultas y permisos actuales; si una cifra necesita una RPC o una tabla nueva, va a "Seguimiento" del PR y el tablero sale sin ella.
- Las rutas, el reparto de perfiles por superficie (D06-E1) y el arranque de tema (D26-E1: la web en claro, la app en "Sistema").
- Las pruebas de tokens, contraste e higiene **se actualizan junto con los tokens, no se relajan**: si un par no llega a AA, se ajusta el token (y la tabla de §1.1), no la prueba. No se quita ni se relaja ningún job de CI ni regla de `.greptile/`.
- E2E: Playwright (`e2e/tests`) y Maestro (`apps/mobile/.maestro`) localizan por rol, texto y `accessibilityLabel`. Los nombres accesibles de los enlaces de navegación y de los botones se conservan; cuando un bloque cambia uno, actualiza los flujos afectados **en el mismo PR**.

### 0.3 Olas y dependencias

| Ola | Bloques | Depende de |
|---|---|---|
| V-A | V1 | — |
| V-B | V2 (web), V6 (app) en paralelo | V1 |
| V-C | V3, V4, V5 (web) y V7, V8 (app) en paralelo | V2 (web), V6 (app) |
| V-D | V9 | todos |

Después de V2 y V6 el kit queda **congelado para los bloques de pantalla**: V3–V5 y V7–V8 pueden agregar componentes en archivos propios de su zona, pero no editan los archivos del kit ni el shell (evita conflictos entre PR paralelos). Lo que le falte al kit va a "Seguimiento" y lo recoge V9.

### 0.4 Definición de terminado (además de plan-v1.md §0.3)

- Capturas en el PR, en claro y oscuro, en una rama `assets/<ID>-screenshots`: web a 1440 px y a 390 px; app en el simulador de iPhone. Con el entorno local y los datos de `supabase db reset` (nunca con cuentas de producción).
- Contraste AA: texto ≥ 4.5:1; bordes de controles y foco ≥ 3:1.
- Un solo primario por pantalla, visible sin scroll a 1440×900 (web) y en la zona inferior fija (app).
- Sin sombras, sin valores sueltos (higiene), tema oscuro revisado pantalla por pantalla.
- El estado nunca se comunica solo con color: cada tono lleva texto y, donde ayude, icono.
- E2E de la zona en verde.

---

## 1. El sistema

Fuente: el sistema de diseño Fulmis de la organización (temas Paper y Night). Los tokens siguen en `packages/shared/src/design/tokens.ts`, con el espejo en `apps/web/src/app/globals.css`. Se conservan los nombres de las claves actuales para no tocar cada pantalla en V1.

### 1.1 Color

| Token | Paper (claro) | Night (oscuro) | Uso |
|---|---|---|---|
| `bg` | `#e7d5ba` | `#121415` | La página |
| `cell` | `#f0e8da` | `#1c1e20` | Tarjetas, tablas, campos |
| `surfaceHigh` | `#dcc7a5` | `#261d18` | Fila seleccionada, chip neutro, bloques destacados |
| `separator` | `#cdb894` | `#2c2f32` | Líneas finas entre superficies (decorativas) |
| `control` (nuevo) | `#7a6440` | `#6e7377` | Borde de campos y controles (≥ 3:1) |
| `text` | `#121415` | `#f4efe6` | Texto |
| `textDim` | `#5c544b` | `#a29a90` | Texto secundario y placeholders |
| `accent` | `#e5630b` | `#e5630b` | Relleno del primario, selección, contadores |
| `accentInk` | `#121415` | `#121415` | Tinta sobre el acento |
| `accentText` | `#993c09` | `#e5630b` | El acento como texto y enlaces |
| `info` (nuevo) | `#0b5f8c` | `#35a9de` | "En curso": texto e iconos |
| `infoFill` / `infoInk` (nuevos) | `#0b5f8c` / `#f4efe6` | `#065aa5` / `#f4efe6` | Píldora "en curso" |
| `amber` | `#fcd090` | `#fcd090` | Relleno de "pendiente" (tinta `#121415`) |
| `amberText` | `#993c09` | `#fcd090` | Aviso como texto |
| `red` / `redInk` | `#61150d` / `#f4efe6` | `#61150d` / `#f4efe6` | Relleno de error, vencido y destructivo |
| `redText` | `#61150d` | `#f2917f` | Error como texto. El valor Night no existe en Fulmis: es derivado |

Se retiran `textFaint` (pasa a `textDim`), `accentSoft` (pasa a `surfaceHigh`), `ok`/`okText`, `highlight`, `glass` y `glassLine`. En V1 quedan como alias de los valores nuevos; V9 los borra.

**No hay verde.** Fulmis no lo tiene. "Hecho" (entregado, pagado, verificado) es un estado **silencioso**: píldora `surfaceHigh` con tinta `text` y un icono de palomita. Lo que pide atención es lo único con color fuerte.

Contrastes medidos (WCAG 2.1):

| Par | Paper | Night |
|---|---|---|
| `text` sobre `bg` / `cell` | 12.9 / 15.2 | 16.1 / 14.6 |
| `textDim` sobre `bg` / `cell` / `surfaceHigh` | 5.2 / 6.1 / 4.5 | 6.7 / 6.0 / 6.0 |
| `accentText` sobre `bg` / `cell` | 4.9 / 5.7 | 5.4 / 4.9 |
| `accentInk` sobre `accent` | 5.4 | 5.4 |
| `info` sobre `bg` / `cell` | 4.8 / 5.7 | 6.9 / 6.3 |
| `infoInk` sobre `infoFill` | 6.1 | 6.1 |
| `redText` sobre `bg` / `cell` | 9.0 / 10.7 | 8.0 / 7.3 |
| `redInk` sobre `red` | 11.3 | 11.3 |
| tinta `#121415` sobre `amber` | 12.8 | 12.8 |
| `control` sobre `bg` / `cell` (borde, ≥ 3) | 3.9 / 4.6 | 3.9 / 3.5 |

Dos restricciones que salen de la medición: el naranja `accent` **no se usa como texto sobre Paper** (2.4:1; para eso está `accentText`), y `accentText` **no va sobre `surfaceHigh`** en Paper (4.25:1; ahí el texto es `text`).

**Tonos de estado** (un solo mapa en `status-tones`, compartido por web y app):

| Tono | Relleno / tinta | Cuándo |
|---|---|---|
| Atención | `accent` / `accentInk` | Requiere una acción de quien mira: oferta por revisar, documento por subir |
| En curso | `infoFill` / `infoInk` | Publicada, en negociación, en tránsito |
| Pendiente | `amber` / `#121415` | Espera a un tercero o está por vencer |
| Hecho | `surfaceHigh` / `text` | Entregado, pagado, verificado |
| Problema | `red` / `redInk` | Vencido, rechazado, incidencia |
| Inactivo | `bg` con borde `control` / `textDim` | Borrador, cancelado, expirado |

**Superficies de marca (siempre Night, en los dos temas):** la barra lateral de la web, el panel de marca del acceso y el bloque "Tu siguiente paso" de la app. Usan `#121415` de fondo, `#f4efe6` de texto, `#a29a90` secundario, `#2c2f32` de línea, `#1c1e20` para el elemento seleccionado y `#e5630b` para su texto y para el botón. Tokens `brand*` aparte, para que no cambien con el tema.

### 1.2 Tipografía

- **Geist** (400, 500, 600, 700, 800, 900) y **Geist Mono** (500, 700). Web: `next/font/google`. App: paquetes `@expo-google-fonts/geist` y `@expo-google-fonts/geist-mono` o, si no existen para la versión de Expo del repo, los `.ttf` (licencia OFL) en `apps/mobile/assets/fonts`. Hanken Grotesk se retira.
- Se conservan los nombres de `typeScale`. Cambios: títulos en 800 con `letter-spacing` −0.035em; cuerpo en 400/500.
- Estilos nuevos:
  - `label`: Geist Mono 11 px, 700, mayúsculas, 0.14em. Para rótulos cortos (hasta tres palabras): encabezados de tabla, rótulo de un indicador, título de sección. Nunca para frases ni para texto que el usuario escribe.
  - `meta`: Geist Mono 11–12 px, 500, 0.08em. Folios, fechas y horas, placas.
  - `numeral`: Geist 900, −0.04em. La cifra principal de un indicador o de un importe destacado.
- Cifras en tablas: Geist 600 con `tabular-nums`, alineadas a la derecha.
- Web de escritorio: cuerpo 15 px y tablas 14 px (hoy usa la escala del teléfono). La app conserva su escala.

### 1.3 Forma, borde, foco

- **Radios:** 0 (tarjetas, tablas, hojas, barra lateral, diálogos), 3 (campos, chips, casillas, elementos de navegación), 8 (botones), 999 (píldoras de estado, avatares, interruptores).
- **Borde:** 1 px `separator` para separar superficies; 1 px `control` en campos y controles. Sin sombras.
- **Foco:** contorno de 2 px en `text` con 2 px de separación, en los dos temas.
- **Alturas:** web, controles de 40 px y filas de tabla de 44 px; app, controles de 48 pt, primario del operador de 56 pt, mínimo táctil de 44 pt (como hoy).
- **Espaciado:** la escala de 4 pt actual.

### 1.4 Marca

- El nombre sale de **una sola constante** (`PLATFORM_NAME` en `packages/shared/src/copy/`); ninguna pantalla lo escribe a mano. Sigue en "Transport" hasta que se decida D25. La propuesta que Mateo vio en el lienzo es **"Fulmis Carga"**; cambiarlo será editar esa constante.
- Marca escrita: Geist 600, −0.03em, con un cuadro `accent` delante. No hay logotipo nuevo en esta ola; V9 solo recolorea el splash y el icono adaptativo (Night con el cuadro señal).

### 1.5 Patrones

**Web**

- **Shell:** barra lateral Night fija de 240 px desde 1024 px de ancho: marca, navegación del perfil en grupos con icono y contador, y abajo la cuenta ("Apariencia", cerrar sesión). Por debajo de 1024 px, una barra superior con botón de menú que abre la misma navegación en un panel. Los enlaces conservan su nombre accesible.
  - Cliente: Inicio, Mis cargas, Viajes, Cartera, Empresa, Notificaciones; "Publicar carga" pasa a ser el botón primario de la barra lateral (sigue siendo un enlace con el mismo nombre).
  - Transportista: Inicio · **Operación** (Cargas, Negociaciones, Viajes) · **Empresa** (Flota y el resto de las pestañas actuales de empresa, cobranza y suscripción) · Notificaciones.
  - Admin: Inicio · **Verificación** (Cola, Usuarios) · **Operación** (Cargas, Intermediadas, Viajes, Incidencias, Carreteras) · **Dinero** (Flete, Suscripciones) · **Sistema** (Auditoría, Ajustes).
- **Inicio como tablero:** una fila de hasta cuatro indicadores (rótulo `label`, cifra `numeral`, enlace al listado ya filtrado), la lista "Requiere tu atención" con una acción por fila, y debajo lo que está vivo (cargas activas en tabla, viaje en curso con su avance por pasos, resumen de cartera o cobranza).
- **Encabezado de página:** título, contexto corto y el primario a la derecha, siempre visible.
- **Tablas:** tabla de verdad (encabezados `label`, números a la derecha, estado con píldora, acción por fila, paginación con el `pager` actual); a 390 px cada fila se vuelve tarjeta.
- **Detalle:** dos columnas desde 1024 px: contenido a la izquierda y un riel fijo a la derecha con estado, importe y acciones. Las secciones largas, en pestañas o anclas.
- **Acciones:** aceptar, contraofertar y rechazar son botones, no filas plegables. Lo irreversible (y todo "Registrar" del admin) pide confirmación en un diálogo que dice qué va a pasar.
- **Dinero:** un formateador compartido que omite `.00` en importes enteros y conserva los centavos cuando existen; la cifra principal en `numeral`.
- **Carga, vacío y error:** `loading.tsx` con esqueletos por segmento de ruta; vacíos que dicen el siguiente paso y traen su botón; errores con reintento.
- **Acceso:** pantalla partida: panel de marca Night (marca, tres líneas de valor) y formulario sobre Paper. Por debajo de 900 px el panel se reduce a un encabezado.

**App**

- **Barra de pestañas sólida** (`cell` con línea `separator`), sin flotar y sin cristal; contador en `accent`.
- **Operador, "Tu siguiente paso":** bloque Night arriba del viaje con el paso actual, el primario de 56 pt a todo lo ancho ("Llegué a la entrega"…) y dos secundarias siempre visibles: "Cómo llegar" y "Reportar incidencia". Debajo, el avance en cuatro pasos y la tarjeta de la carga.
- **Avisos por tono** (los de §1.1), no un solo color.
- **Cobranza:** cifra principal en `numeral` y el desglose debajo.
- **Primario fijo abajo** en formularios y detalles; el resto del cromo inferior se reduce.

---

## 2. Bloques

Formato: objetivo, alcance, fuera de alcance, tests, aceptación, E2E que probablemente se rompan. Rama `v1/<ID>-<slug>`; un PR por bloque; gate D14.

#### V1 · Tokens, fuentes y tema

- **Objetivo:** que la web y la app pasen a Paper/Night, Geist y los radios nuevos desde los tokens, sin editar pantallas.
- **Alcance:**
  - `packages/shared/src/design/tokens.ts`: paleta de §1.1 (claves nuevas `control`, `info`, `infoFill`, `infoInk`, `redInk`, `brand*`; alias temporales de las retiradas), `typeScale` con `label`, `meta` y `numeral`, radios 0/3/8/999, alturas.
  - `tokens.test.ts`: los pares de la tabla de contrastes de §1.1 (texto ≥ 4.5, bordes ≥ 3), en los dos temas.
  - Web: `globals.css` con las variables nuevas, Geist y Geist Mono en `layout.tsx`; `theme-tokens.test.ts` sigue comprobando CSS ↔ tokens.
  - App: `theme.tsx` con la paleta y las fuentes nuevas; la barra de pestañas y las cabeceras dejan el cristal.
  - Higiene (`hygiene.ts` y los dos `hygiene.test.ts`): se agregan a lo prohibido `Hanken`, los hex de la paleta anterior y cualquier sombra (ya sin excepciones).
  - Renombrar el sistema en comentarios y en `/dev/kit` ("Fulmis").
- **Fuera de alcance:** componentes nuevos, navegación, pantallas.
- **Tests:** contraste; CSS ↔ tokens; higiene.
- **Aceptación:** toda la web y la app se ven en Paper/Night con Geist; ningún texto cambia; capturas de una pantalla por perfil.
- **E2E:** ninguno debería romperse.

#### V2 · Kit web, shell con barra lateral y acceso

- **Objetivo:** el esqueleto de la web nueva y las piezas que usarán V3–V5.
- **Alcance:**
  - `components/app-shell.tsx` y `app-shell-client.tsx`: barra lateral, grupos, contadores (con las consultas que ya existen, p. ej. notificaciones sin leer), panel de menú bajo 1024 px. Los tres `layout.tsx` de perfil pasan a declarar grupos.
  - Kit (`components/ui/`): `table.tsx` (tabla real y su forma de tarjeta en móvil), `page-header.tsx` con espacio para el primario, `variants.ts` (botones 8 px, tamaños), `pill.tsx`/`tag.tsx` con los seis tonos, `lib/status-tones.ts`; piezas nuevas `kpi-tile`, `steps`, `money`, `detail-layout` (contenido + riel), `confirm-dialog`; `empty.tsx` y `skeleton.tsx` según §1.5; campos, select y segmentado con los radios y bordes nuevos.
  - Formateador de dinero compartido en `packages/shared` (sin `.00` en enteros), con test.
  - Acceso: `(auth)/layout.tsx` y `auth-card.tsx` con la pantalla partida; cubre login, registro, recuperar, restablecer, verificar correo, invitación, completar registro y aceptar términos.
  - `/dev/kit` muestra todo el kit en los dos temas.
  - Copy nuevo: nombres de grupos de navegación y líneas del panel de marca.
- **Fuera de alcance:** el contenido de las páginas de cada perfil (V3–V5).
- **Tests:** variantes del kit; formateador de dinero; mapa de tonos (cada estado del dominio tiene un tono).
- **Aceptación:** los tres perfiles navegan con la barra lateral a 1440 px y con el panel a 390 px; el acceso es la pantalla partida; las páginas internas siguen funcionando con el kit nuevo aunque todavía no estén rediseñadas.
- **E2E:** todos los de Playwright pasan por la navegación; se conservan los nombres de los enlaces. Revisar en especial `shipper-journey`, `carrier-web-offer`, `carrier-web-trips-fleet`, `manager-company`, `profiles` e `invitations`.

#### V3 · Web del cliente

- **Objetivo:** que el cliente vea qué requiere su atención y publique o responda una oferta sin buscar.
- **Alcance (`app/cliente/**`):** inicio como tablero (ofertas por revisar, cargas publicadas, viajes en curso, saldo por pagar; "Requiere tu atención"; cargas activas; viaje en curso; cartera); "Mis cargas" y "Viajes" en tabla; publicar carga con el primario visible y el formulario en pasos cortos; detalle de carga y de viaje en dos columnas, con las ofertas como tarjetas con botones (aceptar, contraofertar, rechazar); cartera; empresa; notificaciones; `loading.tsx` y vacíos de cada segmento.
- **Fuera de alcance:** kit y shell; reglas de negociación o de pago.
- **Tests:** lógica pura que aparezca (p. ej. qué entra en "Requiere tu atención").
- **Aceptación:** desde el inicio, revisar una oferta o publicar una carga queda a un clic; ningún primario requiere scroll a 1440×900.
- **E2E:** `shipper-journey`, `shipper-provider`, `brokered-load`, `freight-ledger`, `freight-invoices`, `share-links`, `cargo-insurance`.

#### V4 · Web del transportista

- **Objetivo:** lo mismo para el Gerente y el Coordinador en la web.
- **Alcance (`app/transportista/**`):** inicio como tablero (ofertas con respuesta, viajes en curso, por cobrar, documentos por vencer); cargas disponibles en tabla con filtros y el flete destacado; detalle de carga con "Ofertar" como primario; negociaciones; viajes y su detalle en dos columnas; flota (unidades y operadores) en tabla; empresa, documentos, cobranza y suscripción; `loading.tsx` y vacíos.
- **Fuera de alcance:** kit y shell; reglas de suscripción o de pago rápido.
- **Tests:** lógica pura que aparezca.
- **Aceptación:** igual que V3 para sus flujos; el selector de unidad de negocio sigue funcionando.
- **E2E:** `carrier-web-offer`, `carrier-web-trips-fleet`, `manager-company`, `coordinator-operators`, `subscription`, `quick-pay`, `backhaul`, `return-trip`, `road-intelligence`, `trip-internal-chat`, `trip-cancel-release`.

#### V5 · Web del admin y páginas públicas

- **Objetivo:** un panel de operación denso y seguro, y que lo público ya no parezca otra aplicación.
- **Alcance:**
  - `app/admin/**`: inicio como tablero (cuentas por verificar, documentos por revisar, pagos por registrar, incidencias abiertas); todas las listas en tabla con filtros arriba; detalles en dos columnas; confirmación en cada "Registrar" y en lo irreversible; ajustes reunidos en una sola página con secciones; auditoría con paginación (hoy se corta en 200; si paginar pide una RPC nueva, a "Seguimiento").
  - Públicas: `/compartido`, `(auth)/viaje`, `/terminos`, `/aviso-de-privacidad`, `/solo-app`, `/cuenta-en-revision`, `error.tsx` y `global-error.tsx` (que además debe respetar D26-E1 en vez de seguir el tema del sistema).
- **Fuera de alcance:** kit y shell; el texto legal (sigue con datos por definir).
- **Tests:** lógica pura que aparezca.
- **Aceptación:** ninguna acción del admin con efecto en dinero o en cuentas se ejecuta con un solo clic.
- **E2E:** `profiles`, `freight-ledger`, `freight-invoices`, `brokered-load`, `incident-report`, `subscription`, `support-help`, `dwell-times`, `share-links`, `trip-operator-link`.

#### V6 · Kit móvil y navegación

- **Objetivo:** las piezas de la app nueva y sus pantallas de cuenta y acceso.
- **Alcance:** `components/ui.tsx` (botones 8 px con tamaño de 56 pt, campos, celdas, grupos con radio 0), `components/tab-bar.tsx` sólida con contador, cabeceras sólidas, píldoras con los seis tonos, avisos por tono, piezas nuevas (`Steps`, `Money`, `KpiTile`, barra de primario fija); pantallas `(auth)`, cuenta, términos, `company`, `problem`, `unsupported`, que son casi todo kit.
- **Fuera de alcance:** pantallas de operador (V7) y de transportista (V8).
- **Tests:** mapa de tonos; lógica pura del kit.
- **Aceptación:** capturas del kit y de acceso y cuenta en los dos temas; las demás pantallas siguen funcionando.
- **E2E:** `20-terms-acceptance`, `08-operator-invite`, `12-operator-phone` y los subflujos de inicio de sesión.

#### V7 · App del operador

- **Objetivo:** que el operador sepa siempre cuál es su siguiente paso y pueda reportar un problema con un toque.
- **Alcance (`app/(operator)/**`):** `trip.tsx` con el bloque "Tu siguiente paso", avance en cuatro pasos, "Cómo llegar" y "Reportar incidencia" visibles, tarjeta de la carga; estados sin viaje y sin conexión; chat; consentimiento de ubicación; cuenta.
- **Fuera de alcance:** las transiciones del viaje y la cola sin conexión (solo cambia cómo se presentan).
- **Tests:** la función pura que decide el siguiente paso y su texto a partir del estado del viaje.
- **Aceptación:** en cada estado del viaje hay exactamente un primario y está en la primera pantalla; reportar una incidencia no requiere scroll.
- **E2E:** `02-operator-unloading`, `05-operator-pickup`, `06-operator-incident-offline`, `07-operator-delivery`, `15-operator-report`, `16-operator-trip-link`, `19-operator-unload-estimate`, `14-owner-operator-trip`.

#### V8 · App del transportista

- **Objetivo:** el Gerente, el Coordinador y el hombre-camión con el mismo criterio que la web.
- **Alcance (`app/(carrier)/**`):** inicio con indicadores y "Requiere tu atención"; cargas con el flete destacado y filtros; detalle de carga con "Ofertar" fijo abajo; viajes y su detalle; unidades y operadores; "Más" ordenado en grupos; cobranza con cifra principal; suscripción; documentos; "Mi viaje" del hombre-camión reutiliza las piezas de V7 cuando ya estén en `main`.
- **Fuera de alcance:** kit; reglas de oferta y de cobranza.
- **Tests:** lógica pura que aparezca.
- **Aceptación:** un primario por pantalla, fijo abajo; los nombres de las cinco pestañas no cambian.
- **E2E:** `01-carrier-offer`, `03-carrier-assign`, `04-carrier-counteroffer`, `09-manager-company`, `10-coordinator-release`, `11-coordinator-isolation`, `13-owner-operator-offer`, `17-manager-subscription`, `18-carrier-road`, `21-carrier-collections`, `22-brokered-load`, `23-quick-pay`.

#### V9 · Cierre

- **Objetivo:** que no quede nada del sistema anterior.
- **Alcance:** borrar los alias de V1 (`textFaint`, `accentSoft`, `ok`, `okText`, `highlight`, `glass`, `glassLine`) y sus usos; quitar los paquetes de Hanken Grotesk; recoger en el kit lo que V3–V8 dejaron en "Seguimiento"; splash e icono adaptativo en Night con el cuadro señal; capturas completas claro/oscuro en `assets/V9-screenshots` y las de [tiendas.md](tiendas.md); nota de estado final en este documento.
- **Fuera de alcance:** funciones nuevas.
- **Tests:** higiene sin excepciones heredadas.
- **Aceptación:** `pnpm lint`, `typecheck` y `test` en verde; toda la suite E2E en verde; el `grep` de los nombres retirados no devuelve nada fuera de este plan.

---

## 3. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El beige de Paper cansa en pantallas de trabajo largas (tablas del admin) | Las tablas y los formularios van sobre `cell` (`#f0e8da`), no sobre `bg`; si en las capturas de V2 no convence, se aclara `cell` en el token, con su prueba |
| Las esquinas rectas y las mayúsculas en mono se sienten duras | El `label` solo en rótulos cortos; botones de 8 px y campos de 3 px suavizan lo que se toca |
| Sin verde, "hecho" pasa desapercibido | Icono de palomita y texto; es deliberado (lo que no pide acción no compite). Si Mateo lo quiere con color, es un token más en V9 |
| PR paralelos chocan en el kit | El kit se congela tras V2 y V6 (§0.3) |
| Los E2E se rompen por la navegación nueva | Se conservan los nombres accesibles; cada bloque corre y actualiza los de su zona en el mismo PR |
| Un tablero pide datos que hoy no se pueden leer | Sale sin esa cifra y queda en "Seguimiento" (§0.2) |

## 4. Seguimiento (para Mateo)

1. **Nombre comercial (D25):** ¿"Fulmis Carga", como en el lienzo, u otro? Hasta entonces la marca dice "Transport".
2. **Logotipo e icono de la app:** esta ola solo recolorea. ¿Lo propones tú o se propone uno aparte?
3. **Verde de éxito:** el plan no lo agrega (§1.1). Decir si se quiere.
4. **El cliente en la app:** hoy es solo web (D06-E1). Llevarlo a la app es un cambio de producto, fuera de esta ola.
5. **Textos legales:** las páginas se rediseñan en V5, pero siguen con datos por definir.
