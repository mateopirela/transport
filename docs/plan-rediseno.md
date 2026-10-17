# Plan de rediseño visual: "Transport · Nativo"

Rediseño de la web y la app para que se vean y se sientan **limpias, sencillas y con aire de Apple**: una sola familia tipográfica, una página neutra cálida con celdas blancas agrupadas, un solo color de acento usado con moderación, bordes finos en vez de sombras, botones en píldora, estados de carga y vacíos que parecen contenido, y tema claro y oscuro. La referencia es el sistema "C · Nativo" de la app de ShowBe (2026-10-16), adaptado a la marca de Transport.

Se ejecuta como los demás planes: un PR por bloque, gate de Greptile (D14), definición de terminado de [plan-v1.md §0.3](plan-v1.md) más lo que agrega §0.3 de este documento. **No cambia ninguna funcionalidad, texto, ruta, RPC ni política**: es solo presentación.

## 0. Cómo se ejecuta

### 0.1 Alcance y límites

- **Sí:** tokens de diseño, componentes de UI, cada pantalla de `apps/mobile` y `apps/web`, tema oscuro, iconos, tipografía, movimiento discreto, capturas nuevas para las tiendas.
- **No:** copy (los textos de `packages/shared/src/copy/` no cambian, salvo que una pantalla nueva del rediseño necesite uno nuevo), rutas, navegación entre pantallas, consultas, RPC, migraciones, RLS, lógica de negocio. Si una pantalla necesita un dato que hoy no recibe, va a "Seguimiento" del PR.
- **E2E intactos:** Playwright (`e2e/tests`) y Maestro (`apps/mobile/.maestro`) localizan por rol, texto y `accessibilityLabel` ("Viajes, tab…", "Entrar", "Correo electrónico"). Los textos, los roles de accesibilidad y las etiquetas de las pestañas **se conservan**. Cada bloque corre los flujos que cubren sus pantallas y los arregla si la estructura los rompió (es parte del bloque, no un seguimiento).

### 0.2 Olas y dependencias

```
Ola U-A   U1  tokens, fuentes y tema (shared + web + app)
Ola U-B   U2  kit de UI móvil            U6  kit de UI web y shell
Ola U-C   U3  móvil: acceso y cuenta     U7  web: cliente
          U4  móvil: transportista       U8  web: admin y públicas
          U5  móvil: operador
Ola U-D   U9  cierre: limpieza, tema oscuro, accesibilidad, E2E y capturas
```

| Bloque | Depende de |
|---|---|
| U1 | `main` (con §G o sin él, ver §0.4) |
| U2 | U1 |
| U6 | U1 |
| U3, U4, U5 | U2 |
| U7, U8 | U6 |
| U9 | todos |

U3, U4 y U5 tocan pantallas distintas y pueden correr a la vez; lo mismo U7 y U8. Ninguno de ellos edita el kit (`components/ui.tsx`, `components/ui/*`): si falta un componente, lo agrega **en su PR con un test**, con nombre y API que un revisor del kit aceptaría, y lo anota en "Seguimiento" para que U9 lo consolide.

### 0.3 Definición de terminado (además de plan-v1.md §0.3)

- **Capturas en claro y oscuro** de cada pantalla migrada, en una rama `assets/<ID>-screenshots`, enlazadas en el PR en una tabla. En móvil, del simulador iPhone 18 Pro; en web, de Playwright a 1280 px y 390 px.
- **Contraste:** todo texto cumple AA (4.5:1 normal, 3:1 grande); los tokens lo prueban (U1). Un componente nuevo no introduce colores fuera de los tokens.
- **Un solo primario por pantalla:** la acción principal es el único botón lleno con el acento. Lo demás es secundario (celda), simple (texto) o destructivo.
- **Sin sombras** salvo la barra de pestañas flotante y el segmento seleccionado.
- **Sin valores sueltos:** ningún color, radio ni tamaño de fuente escrito a mano en una pantalla; todo sale de `useTheme()` (app) o de las clases de Tailwind sobre los tokens (web). U9 lo verifica con una prueba de higiene.
- **Tema oscuro** revisado en cada pantalla (no solo "no se rompe": se ve bien).
- **Sin cambios de copy** salvo los listados en el PR, y siempre en `packages/shared/src/copy/`.
- **E2E de la zona en verde** (ver §0.1).

### 0.4 Convivencia con §G

Los bloques G (gerente, coordinador, web del transportista, G10a/G10b) agregan pantallas. Dos reglas:

1. Si un bloque G ya está en `main` cuando corre el bloque U de su zona, el bloque U migra también esas pantallas (están dentro de su zona).
2. Si un bloque G se abre **después** de U2 o U6, construye sus pantallas con el kit nuevo (esa es la razón de que el kit vaya primero). Los agentes G leen este plan.

Cada agente U hace `git fetch` y rebasa sobre `main` antes de abrir el PR y antes del merge; las pantallas nuevas que aparecieron en su zona entran en el mismo PR.

### 0.5 Decisión de producto

Se registra en `docs/decisiones.md` como **D26** (lo hace U1, cuando el PR #45 ya esté en `main` y la numeración sea estable):

> **D26 · 2026-10-17 · Sistema visual "Transport · Nativo".** La web y la app adoptan un sistema visual único: Hanken Grotesk como única familia; página neutra cálida con celdas blancas agrupadas (estilo iOS); un solo acento (azul `#1F5EFF`) en un primario por pantalla, selecciones y distintivos; bordes finos en vez de sombras; botones en píldora; estados de carga y vacíos que parecen contenido; tema claro, oscuro o el del sistema, con la elección guardada en el dispositivo. Reemplaza el tema del deck (azul marino, títulos en serif). Referencia: el sistema "C · Nativo" de ShowBe. · Confirmada (Mateo).

## 1. El sistema visual

Fuente de verdad: `packages/shared/src/design/tokens.ts` (datos puros, sin React). La app y la web lo consumen; nadie escribe un color en otro lado.

### 1.1 Color

Dos temas. Nunca negro puro ni blanco puro de fondo. Los nombres son los del sistema de ShowBe para que la referencia se lea directo.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | `#F4F2EE` | `#131214` | la página |
| `cell` | `#FFFFFF` | `#1D1C1F` | celdas, tarjetas, grupos, campos |
| `separator` | `#E7E2DA` | `#2D2B30` | líneas finas (hairline) |
| `surfaceHigh` | `#ECE8E2` | `#2A282C` | un paso más que la página: tiles de icono, controles deshabilitados, burbujas propias del chat |
| `text` | `#1A1917` | `#F2F0EE` | texto |
| `textDim` | `#6E6963` | `#A5A09B` | secundario |
| `textFaint` | `#A39E97` | `#6E6A66` | terciario, placeholders |
| `accent` | `#1F5EFF` | `#5C8CFF` | **el** acento: primario, selección, distintivos |
| `accentText` | `#0F47D4` | `#8AB0FF` | acento como texto sobre la página |
| `accentInk` | `#FFFFFF` | `#0B1430` | tinta sobre el acento |
| `accentSoft` | `#E4ECFF` | `#1C2742` | acento al 14 %: fondo de píldoras y filas seleccionadas |
| `ok` | `#2B8A57` | `#5FCF95` | éxito, "Disponible", "Entregado" |
| `amber` | `#B8781A` | `#E9B45A` | pendiente, por vencer |
| `red` | `#C0392B` | `#FF8A7E` | error, vencido, destructivo |
| `highlight` | `#F4E9DA` | `#3E3328` | aviso después de algo que salió bien |
| `glass` | `rgba(255,255,255,0.74)` | `rgba(29,28,31,0.82)` | barra flotante y barra inferior (con desenfoque) |
| `glassLine` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | borde del vidrio |

Los tonos de estado (`ok`, `amber`, `red`, `accent`) se usan **sobre su propio 14 %** en las píldoras (`Pill`), nunca como texto suelto sobre blanco salvo `accentText` y `red`.

El azul se eligió por continuidad con la marca actual (`#2563EB`) y porque la pantalla de logística vive entre mapas y estados verde/ámbar/rojo: un acento frío los deja respirar. Es un dato: cambiarlo es editar dos líneas de `tokens.ts`.

### 1.2 Tipografía

Una familia: **Hanken Grotesk** (OFL), pesos 400, 500, 600 y 700. Web con `next/font/google`; app con `@expo-google-fonts/hanken-grotesk` y `expo-font` (se cargan antes de ocultar el splash). Escala tipo iOS, con cifras tabulares en dinero, fechas y placas:

| Estilo | Tamaño / interlínea | Peso | Letter-spacing |
|---|---|---|---|
| `largeTitle` | 34 / 41 | 700 | −0.75 |
| `title1` | 28 / 34 | 700 | −0.6 |
| `title2` | 22 / 28 | 700 | −0.3 |
| `title3` | 20 / 25 | 600 | −0.24 |
| `headline` | 17 / 22 | 600 | 0 |
| `body` | 17 / 22 | 400 | 0 |
| `callout` | 16 / 21 | 400 | 0 |
| `subhead` | 15 / 20 | 400 | 0 |
| `footnote` | 13 / 18 | 400 | 0 |
| `caption` | 12 / 16 | 400 | 0 |
| `label` | 13 / 18 | 600 | 0, en `textDim` |

Títulos en **oración** ("Mis viajes", no "MIS VIAJES" ni "Mis Viajes"). Nada en mayúsculas sostenidas. Se eliminan Georgia, Marcellus y Manrope.

En web la misma escala en `rem` (17 px = `1.0625rem`), con `largeTitle` solo en el título de página y `title2` en secciones.

### 1.3 Espacio, radio, borde, sombra

- Espaciado: 4 / 8 / 16 / 24 / 40 (`xs sm md lg xl`). Márgenes laterales 16 en móvil; en web, contenedor de 1040 px con 24 de margen.
- Radios: campo 12, celda/grupo/tarjeta/foto 16, hoja (sheet) 28 arriba, etiqueta pequeña 6, botones/chips/píldoras 999.
- Bordes: `StyleSheet.hairlineWidth` / `1px` en `separator`. Separador de celdas **con inset** de 16 a la izquierda.
- Sombras: solo la barra de pestañas flotante (opacidad 0.22, radio 18) y el segmento seleccionado (0.08). Nada más.
- Altura mínima de celda 50; botón 52 (40 el pequeño); campo 48.

### 1.4 Iconos

Línea, trazo 2, extremos redondeados, 24 px. En móvil, **Ionicons outline** de `@expo/vector-icons` (ya instalado, sin módulo nativo nuevo); en web, **lucide-react** (misma estética). Un icono por fila de navegación y por pestaña; dentro de las celdas, solo cuando ayuda a escanear (documentos, unidades, operadores). Nunca iconos de relleno (filled) salvo en la pestaña activa.

### 1.5 Movimiento

Discreto y corto: 150–250 ms, curva estándar de la plataforma. Esqueletos que pulsan en lugar de spinners a pantalla completa; el spinner solo dentro de un botón ocupado. Hojas (sheets) que suben desde abajo para confirmar y elegir; en web, diálogos centrados y hojas laterales solo en admin.

### 1.6 Componentes

**Móvil** (`apps/mobile/src/components/ui.tsx`, con `useTheme()` de `apps/mobile/src/theme.tsx`):

| Componente | Qué es |
|---|---|
| `Screen` | scroll con teclado resuelto, padding del sistema, espacio para la barra flotante; `largeTitle` opcional con subtítulo y acción a la derecha |
| `LargeTitle`, `SectionHeader`, `GroupLabel`, `Footnote` | jerarquía de texto |
| `Group` | contenedor de celdas: `cell`, radio 16, hairline, separadores con inset |
| `Cell` | fila de 50+: icono opcional, título, subtítulo (máx. 2 líneas), valor a la derecha, chevron si navega, `Pill` opcional |
| `SwitchCell`, `FieldCell`, `ControlCell`, `TextCell`, `ValueRow` | variantes de fila |
| `Button` | píldora de 52; `primary` (acento, uno por pantalla), `secondary` (celda), `plain` (texto), `destructive`; `small`; `loading` |
| `BottomBar` | barra inferior de vidrio con la acción principal de la pantalla (y una secundaria opcional) |
| `Field` | campo de 48, radio 12, etiqueta `label` arriba, error `red` abajo; multiline; tipos de teclado |
| `Segmented`, `ChipTabs`, `Chip`, `SearchBox`, `Checkbox` | selección y filtro |
| `Pill` | estado: texto `footnote` semibold en el tono sobre su 14 % |
| `Empty` | título fuerte + una oración + acción opcional, dentro de un grupo |
| `Skeleton`, `Loading`, `LoadError` | carga y error con reintento |
| `Notice`, `ErrorText` | aviso en `highlight` / error |
| `TabBar` | barra de pestañas flotante de vidrio (`expo-blur`), píldora, con contador de no leídos |
| `Sheet`, `ConfirmSheet`, `OptionSheet`, `PickerSheet` | hojas (`@gorhom/bottom-sheet`) |

Los nombres antiguos (`Title`, `Body`, `Centered`, `Card`, `Badge`, `SectionTitle`, `Loaded`, `ChoiceChips`, `MultiChips`) se mantienen como alias finos hasta U9, que los borra.

**Web** (`apps/web/src/components/ui/*`, shadcn sobre Tailwind 4 con los tokens en `globals.css`):

| Componente | Qué es |
|---|---|
| `button` | píldora; `primary`, `secondary`, `plain`, `destructive`; 44 px (36 el pequeño) |
| `group`, `cell` | el equivalente de `Group`/`Cell`: `bg-card rounded-2xl border divide-y` |
| `input`, `textarea`, `select`, `label`, `field` | campos de 44, radio 12 |
| `pill`, `tag` | estado |
| `empty`, `skeleton` | estados |
| `sheet`, `dialog` | confirmaciones y formularios cortos |
| `segmented`, `tabs`, `search` | filtros |
| `table` | solo en admin; filas de 48, sin rayas, cabecera `label` |
| `page-header` | título `largeTitle`, subtítulo, acción primaria a la derecha |
| `app-shell` | barra superior clara de vidrio con el nombre, las secciones como pestañas de texto y la cuenta; sin franja azul marino; en ≥1024 px la navegación puede ir en una barra lateral de 240 px |

### 1.7 Patrones de pantalla

- **Lista:** `LargeTitle` + búsqueda/segmentos si hay más de ~8 elementos + grupos de celdas. Nunca tarjetas con sombra una tras otra.
- **Detalle:** título, una `Pill` de estado junto al subtítulo, grupos por tema ("Ruta", "Carga", "Documentos", "Actividad"), acción principal en `BottomBar`.
- **Formulario:** campos en un grupo, una sección por paso, el primario en la `BottomBar`; errores junto al campo; nada de alertas modales para validación.
- **Mapa:** a sangre dentro de un grupo de 16 de radio, con la información encima en una celda de vidrio.
- **Chat:** burbujas propias en `accentSoft`, ajenas en `surfaceHigh`, hora en `caption`.
- **Línea de tiempo** del viaje: puntos de 8 px y línea `separator`, el paso actual en `accent`.

## 2. Bloques

Formato: objetivo, alcance, fuera de alcance, tests, aceptación, E2E que probablemente se rompan.

#### U1 · Tokens, fuentes y tema

- **Objetivo:** que las dos apps lean los colores, la tipografía y los radios de un solo lugar, con tema claro y oscuro, sin tocar aún ninguna pantalla.
- **Alcance:**
  - `packages/shared/src/design/tokens.ts`: `palette` (claro y oscuro, §1.1), `typeScale` (§1.2), `spacing`, `radii`, `shape`. Función pura `contrastRatio(a, b)` y test de Vitest que afirma AA para cada par texto/fondo que el sistema usa (`text`/`bg`, `text`/`cell`, `textDim`/`cell`, `accentInk`/`accent`, `accentText`/`bg`, cada tono sobre su `*Soft`). Exportado desde `@transport/shared`.
  - **App:** `apps/mobile/src/theme.tsx` reemplaza a `theme.ts`: `ThemeProvider` (claro / oscuro / sistema, guardado con `expo-secure-store` o `AsyncStorage`, lo que ya exista), `useTheme()` → `{ theme, colors, type, box }`, `useStyles()`, `useStackScreenOptions()` (cabecera sin sombra, color de página, título `headline`, botón atrás minimal). Carga de Hanken Grotesk antes de ocultar el splash. **Alias** de las claves actuales (`navy`, `accent`, `background`, `surface`, `textMuted`, `border`, `dangerSurface`…) sobre los valores nuevos, de modo que `components/ui.tsx` y todas las pantallas cambien de paleta y fuente sin editarlas. `Title` pasa a Hanken 700.
  - **Web:** `globals.css` con los tokens como variables (`--bg`, `--cell`, … y los nombres de shadcn mapeados: `--background`, `--card`, `--primary` = acento, `--muted`, `--border`), tema oscuro por `prefers-color-scheme` y por clase `.dark` (la elección se guarda en una cookie `theme`, leída en `layout.tsx` para evitar el parpadeo), `--font-sans` = Hanken; sin `--font-serif`; `h1–h3` sin `font-serif`. Test de Vitest que lee `globals.css` y comprueba que cada hex coincide con `tokens.ts`.
  - Conmutador de tema: fila "Apariencia" en la cuenta (app) y en el menú de la cuenta (web). Copy nuevo en `packages/shared/src/copy/` (`appearance: { title, system, light, dark }`).
  - D26 en `docs/decisiones.md`.
- **Fuera de alcance:** componentes y pantallas nuevas.
- **Tests:** contraste; CSS ↔ tokens; `resolveTheme(choice, scheme)` puro.
- **Aceptación:** `pnpm lint/typecheck/test` verde; la app y la web abren con la fuente y la paleta nuevas en claro y oscuro sin pantallas rotas; Maestro 01 y Playwright pasan sin cambios.
- **E2E que probablemente se rompan:** ninguno (solo cambian estilos).

#### U2 · Kit de UI móvil

- **Objetivo:** los componentes de §1.6 (móvil), listos para que U3–U5 migren pantallas sin inventar nada.
- **Alcance:** `components/ui.tsx` (reescrito; los alias de §1.6 al final del archivo), `components/icons.tsx` (mapa `IconName` → Ionicons outline), `components/tab-bar.tsx` (flotante de vidrio; la etiqueta de accesibilidad de cada pestaña sigue siendo "<label>, tab, n of m"), `components/sheet.tsx` (`@gorhom/bottom-sheet` + `react-native-reanimated`, ya instalado), `expo-blur` (si la rebuild del dev client fuera un problema, `glass` opaco como alternativa documentada). `fleet-ui.tsx` queda como alias. Pantalla de muestra `src/app/dev/kit.tsx` solo en `__DEV__` con todos los componentes en los dos temas, para las capturas del PR.
- **Fuera de alcance:** migrar pantallas (solo las que el kit obliga: la barra de pestañas y el layout raíz).
- **Tests:** Vitest con `react-test-renderer` o `@testing-library/react-native` para `Cell` (chevron solo si navega), `Button` (un `accessibilityRole="button"`, estado `loading` deshabilita), `Pill` (tono → colores del tema), `Empty`, `Segmented` (selección), `fold()` de búsqueda sin acentos.
- **Aceptación:** la app completa sigue funcionando con la barra nueva; Maestro 01–07 pasan (las pestañas conservan su etiqueta); capturas del kit en claro y oscuro.
- **E2E que probablemente se rompan:** los `tapOn: 'Viajes, tab.*'` si la etiqueta cambia (no debe).

#### U3 · Móvil: acceso, registro, empresa y cuenta

- **Pantallas:** `(auth)/sign-in`, `(auth)/sign-up`, `auth/callback`, `invite`, `company`, `problem`, `unsupported`, `index`, `(operator)/account`, `(carrier)/(tabs)/more`, `components/account-screen`, `check-email`, `company-status`, `legal-links`, `offline-banner`, `placeholder-screen`, y las pantallas de registro de G2 si ya están en `main` (hombre-camión, registro por enlace, teléfono).
- **Reglas:** una pantalla de acceso con un solo primario ("Entrar"); "Crear cuenta" y "Olvidé mi contraseña" como `plain`. Registro por pasos en grupos. "Cuenta" como grupos de celdas (nombre, correo, perfil, empresa, apariencia, legal, cerrar sesión en `destructive` plain).
- **Tests:** los existentes de `routing` y `auth` siguen; snapshot ligero de `sign-in` en los dos temas si el proyecto ya tiene infraestructura de render (si no, capturas).
- **E2E:** `subflows/sign-in.yaml` (toca "Tu siguiente viaje, antes de terminar el actual." para esconder el teclado: conservar ese subtítulo o actualizar el subflow en el mismo PR), Maestro 01–07.

#### U4 · Móvil: transportista (Gerente y Coordinador)

- **Pantallas:** `(carrier)/(tabs)/home` (recomendaciones), `units`, `loads`, `trips`, `load/[id]` + `negotiation-panel` + `chat-panel`, `trip/[id]` + `trip-assign-form` + `trip-documents-section` + `trip-sections`, `vehicle/[id]` + `vehicle-form` + `availability-section` + `document-list`, `operator/[id]` + `operator-form` + `invitation-section`, `operators`, `routes`, `company-documents`, `load-card`, `route-preview`, y lo de G4 (apartado del gerente, unidades de negocio) si ya está en `main`.
- **Reglas:** listas como grupos de celdas con `Pill` de estado; detalle con la acción principal en `BottomBar` ("Ofertar", "Asignar", "Marcar disponible"); negociación como línea de ofertas + chat; formularios en grupos. Mapa dentro de un grupo.
- **E2E:** Maestro 01, 03, 04 (oferta, asignación, contraoferta); Playwright `return-trip.spec.ts` llama RPC, no toca la UI móvil.

#### U5 · Móvil: operador

- **Pantallas:** `(operator)/trip` + `trip-sections` (línea de tiempo, pasos), `trip-forms`, `evidence-section` (fotos), `trip-position`, `tracking-banner`, `trip-map`, `location-consent`, incidencias y su cola sin conexión, chat del viaje.
- **Reglas:** el paso siguiente siempre en la `BottomBar` como único primario; la línea de tiempo de §1.7; las fotos en una cuadrícula de 3 con radio 16 y estado "espera señal" como `Pill` ámbar; el consentimiento de ubicación como pantalla de un solo primario con la explicación en `Notice`.
- **E2E:** Maestro 02, 05, 06, 07 (incluido el flujo sin conexión y la cámara de prueba).

#### U6 · Kit de UI web y shell

- **Objetivo:** los componentes de §1.6 (web), el `app-shell` nuevo y las páginas de acceso, para que U7 y U8 solo migren contenido.
- **Alcance:** `components/ui/*` (button, group, cell, input, textarea, select, label, field, pill, tag, empty, skeleton, sheet, dialog, segmented, tabs, search, table, page-header), `app-shell` (§1.6), `auth-card` + `auth-forms` + páginas `(auth)/*`, `error-fallback`, `pager`, `notifications/notification-badge`, `lucide-react`. `radix-ui` ya está: úsalo para dialog, sheet, tabs, select. Página de muestra `/dev/kit` solo en desarrollo.
- **Tests:** Vitest de `buttonVariants` (clases por variante), `pill` (tono → clases) y de la cookie de tema; Playwright `shipper-journey.spec.ts` (registro, verificación de correo, login) debe pasar.
- **E2E:** `shipper-journey.spec.ts` pasos de acceso; `e2e/support/web.ts` si usa selectores de estructura.

#### U7 · Web: cliente

- **Páginas:** `/cliente` (inicio), `cargas` (lista, nueva, editar, detalle) + `load-form` + `place-field` + `route-map` + `load-actions` + `load-status-badge`, `negociaciones/[id]` + `offer-board` + `offer-response` + `chat-panel`, `viajes` (lista, detalle) + `trip-map` + `trip-actions` + `trip-status-badge` + `auto-refresh`, `notificaciones`, `document-upload`, `verification` + `verification-forms`, `cuenta-en-revision`; más lo de G6 y G7 (documentos compartidos, alta de proveedor, compartir por enlace, `/compartido/[token]`) si ya está en `main`.
- **Reglas:** inicio con un `page-header` y grupos "Cargas activas", "Viajes en curso", "Pendientes"; la lista de cargas como celdas con `Pill`; el formulario de carga en secciones (origen, destino, ventanas, mercancía, precio) con un primario abajo a la derecha; la negociación en dos columnas en ≥1024 px (ofertas | chat); el seguimiento con el mapa a sangre y la línea de tiempo al lado.
- **E2E:** `shipper-journey.spec.ts`, `incident-report.spec.ts`, `return-trip.spec.ts` (los tres).

#### U8 · Web: admin y páginas públicas

- **Páginas:** `/admin` (estadísticas), `verificacion`, `empresas/[id]`, `usuarios`, `cargas` (lista, detalle), `viajes`, `incidencias`, `auditoria` + `admin/filter-bar` + `admin/ops-forms`; públicas: `/` (landing: una pantalla limpia con el nombre, una frase, "Entrar" y "Crear cuenta"), `/solo-app`, `/terminos`, `/aviso-de-privacidad` + `legal-document`; y la web del transportista de G10a/G10b si ya está en `main` (si no, G10 la construye con el kit, §0.4).
- **Reglas:** admin denso pero limpio: `table` de 48 px, filtros en `segmented` + `search`, acciones en `sheet` lateral; estadísticas como celdas con número `title1` tabular y `label`.
- **E2E:** `shipper-journey.spec.ts` (el admin aprueba la empresa en el flujo).

#### U9 · Cierre

- **Objetivo:** que no quede nada del tema anterior y que el conjunto se vea como un solo producto.
- **Alcance:**
  - Borrar los alias (`Title`, `Body`, `Card`, `Badge`, `Loaded`, `fleet-ui.tsx`, `theme.ts`, `--navy`, `font-serif`, Georgia/Marcellus/Manrope) y migrar lo que aún los use.
  - **Prueba de higiene** (Vitest): ningún archivo de `apps/*/src` fuera del kit y de `theme.tsx` contiene un color hex o `rgba(`, `fontSize:` numérico, `borderRadius:` numérico, `shadow*`, `elevation`, ni las palabras `navy`, `Georgia`, `serif`.
  - Pasada de tema oscuro por todas las pantallas (capturas); pasada de contraste y de tamaños táctiles (≥44 px).
  - `pnpm e2e:mobile` completo y Playwright completo; `expo export` y `next build`.
  - Capturas finales claro/oscuro para `docs/tiendas.md` (las de las tiendas) y `docs/demo-local.md` si muestra pantallas; `apps/mobile/app.json`: color del splash y del icono adaptativo sobre `bg`/`accent`.
  - `docs/plan-rediseno.md`: estado final y seguimientos.
- **Aceptación:** la prueba de higiene pasa; todo E2E verde; capturas completas.

## 3. Requisitos previos (antes de lanzar el workflow)

| Requisito | Para qué | Responsable |
|---|---|---|
| GitHub Actions con facturación al día | CI verde en cada PR (gate D14) | Mateo |
| PR #45 (§G) en `main`, o decidir correr el rediseño antes de §G (§0.4) | numeración de D26 y pantallas de G | Mateo |
| Simulador iPhone 18 Pro con la build de desarrollo, Metro libre, Maestro y JDK en `~/.local` | capturas y Maestro de U2–U5 y U9 | listo |
| `expo-blur` y `@gorhom/bottom-sheet` añaden módulos nativos: una rebuild del dev client (`expo run:ios`) en U2 | barra flotante y hojas | el agente de U2 |

## 4. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Un bloque "mejora" el copy y rompe un E2E | §0.1: copy intacto; el E2E de la zona corre en cada PR |
| Conflictos entre U3/U4/U5 (o U7/U8) | zonas disjuntas; el kit solo lo edita U2/U6; componentes nuevos de zona con test y seguimiento para U9 |
| Conflictos con los bloques G que corren a la vez | §0.4: rebase antes del PR y del merge; los G nuevos usan el kit |
| Rebuild nativa por `expo-blur` / bottom-sheet | alternativa opaca documentada; la rebuild se hace una vez en U2 |
| Tema oscuro a medias | capturas obligatorias en los dos temas por PR; pasada de U9 |
| El acento azul no convence | es un dato en `tokens.ts`; cambiarlo son dos líneas y el test de contraste avisa |
| Greptile no evalúa estética | el gate sigue siendo lógica y seguridad; la estética la juzga Mateo con las capturas de cada PR, y U9 recoge sus notas |

## 5. Seguimiento (para Mateo)

1. ¿Nombre comercial (D25)? El `largeTitle` de la pantalla de acceso y el shell lo muestran; hoy "Transport".
2. ¿Icono de la app y splash nuevos? U9 solo ajusta colores; un icono nuevo es diseño aparte.
3. ¿Barra lateral en la web de escritorio para admin, o pestañas arriba como en cliente? Por defecto, pestañas arriba en todo y barra lateral solo en admin ≥1024 px.
