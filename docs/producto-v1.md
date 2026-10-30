# Especificación de producto: V1

> Consolida el deck de JP, la reunión del 14 oct 2026, las respuestas de JP y Mateo del 16 oct 2026 y las decisiones en [decisiones.md](decisiones.md). Las fuentes originales están en [fuentes/](fuentes/). Cómo se construye lo nuevo del 16 oct: [plan-v1.md §G](plan-v1.md).

## 1. Visión y problema

**Visión:** que cada camión tenga el mayor número posible de kilómetros productivos, con menos viajes vacíos.

**Promesa de la V1:** *conseguir el siguiente viaje antes de que el camión termine el actual.*

**Problemas que atacamos** (del deck y de la experiencia de la empresa de JP):

1. Los camiones regresan vacíos (kilómetros improductivos).
2. No se sabe cuándo termina la descarga (puede tardar de 3 a 10 días), y eso bloquea la planeación del siguiente viaje.
3. Las tarifas buscadas de último minuto no cubren los costos.
4. Hay incompatibilidad entre el camión y la mercancía.
5. Falta confianza y seguridad: no se sabe con quién se trata.
6. Las altas de proveedores son tediosas.
7. Falta coordinación logística.

**Competidor directo:** BeGo, que tiene 3 apps separadas. Nos diferenciamos con viajes de regreso, anticipación de disponibilidad, mejor UX y altas simples.

**Lanzamiento:** una sola ruta, **Monterrey ↔ Guadalajara**. El primer transportista es la empresa familiar de JP. La prueba piloto es **gratis** (D24, D30: bandera global de piloto) y el flete se paga fuera de la plataforma (D08-E1).

## 2. Perfiles

| Perfil | Quién es | Plataforma V1 |
|---|---|---|
| **Cliente** | Empresa que necesita mover carga | Web |
| **Gerente** (transportista) | Dueño o director de la empresa transportista: lo legal, la flota, las unidades de negocio, los coordinadores y la suscripción (D24, D30) | App móvil y web (D06-E1) |
| **Coordinador** (transportista) | Opera una o varias unidades de negocio: busca cargas, negocia, asigna y supervisa | App móvil y web (D06-E1) |
| **Operador** | Conductor que ejecuta el viaje | App móvil (vista de operador) |
| **Hombre-camión** | Transportista independiente: una sola cuenta con los perfiles de Gerente y Operador (D13) | App móvil y web |
| **Admin** | Equipo interno: verifica, supervisa y resuelve | Web |

- **Unidad de negocio** (grupo): conjunto de camiones y operadores de una empresa transportista, con uno o varios coordinadores asignados (D19). Toda empresa transportista tiene al menos una ("Principal"). Un camión y un operador pertenecen a una sola; un coordinador puede tener varias.
- Cada empresa (cliente o transportista) pasa por **verificación** antes de operar. Mientras está "en revisión" puede completar su perfil, pero no publicar cargas ni ofertar.
- **Cómo entra cada quien:** Cliente, Gerente, Coordinador y hombre-camión, con correo y contraseña. El Operador, con **teléfono y contraseña** (D15-E1). La web y la app tienen un solo campo "Correo o teléfono".

## 3. Funcionalidades V1 por perfil

### Cliente (web)
- Registro de empresa: RFC y razón social, domicilio fiscal, representante legal (cuando se requiera) y documentos (D16). Usuario con nombre, correo, **teléfono** y contraseña. La cuenta queda en revisión.
- Publicar carga con:
  - origen y destino (autocompletado de Google)
  - ventana de recolección y ventana de entrega
  - mercancía, tipo de carga, peso y volumen
  - tipo de unidad requerida y requisitos especiales
  - precio propuesto (MXN)
- Editar o cancelar publicaciones mientras no estén contratadas.
- Recibir ofertas, compararlas, contraofertar, aceptar o rechazar. Cada negociación tiene su chat con el coordinador.
- Al aceptar: ver los **documentos compartidos** del transportista, de la unidad y del operador (solo lectura) y **dar de alta al transportista como proveedor** si lo necesita (D21).
- Viajes activos e historial:
  - mapa en vivo
  - línea de tiempo de eventos
  - fotos de evidencia
  - documentos del viaje (D22): subir la orden de servicio y ver el CFDI con Carta Porte y la factura que sube el coordinador
  - confirmación de entrega
  - **fin estimado de descarga** y en qué se basa (estimado del operador, viajes medidos en el sitio o 4 h por defecto) (D32)
- **Tiempo típico en tu sitio** (D32): en cada carga y viaje, cuánto tardan los camiones en cargar y descargar en sus propios sitios (espera + maniobra), medido con sus viajes anteriores.
- **Compartir** una carga o el seguimiento de un viaje con un enlace público de solo lectura (D23). El seguimiento público muestra el mismo fin estimado de descarga que ve el cliente, solo la hora: sin decir en cuántos viajes se basa.
- Reportar incidencias.

### Gerente (app y web)
- Registro de la empresa: RFC y razón social, Constancia de Situación Fiscal, representante legal (nombre e identificación) y domicilio fiscal. Usuario con nombre, correo, teléfono y contraseña.
- **Mi empresa**:
  - unidades de negocio: crear, renombrar y archivar
  - coordinadores: invitar por enlace, asignarlos a una o varias unidades de negocio, moverlos o darlos de baja
  - camiones: alta con placas, tipo de unidad, capacidad, número de ejes (decide la tarifa de casetas, D31) y documentos (tarjeta de circulación, permisos, seguro vigente); editarlos, moverlos de unidad de negocio o darlos de baja
  - operadores: invitar por enlace, moverlos de unidad de negocio, restablecerles el acceso o darlos de baja
  - las bajas nunca rompen un viaje activo (se bloquean mientras haya uno)
- Supervisar **todos** los viajes de la empresa, con filtro por unidad de negocio.
- Todo lo que hace un coordinador, en cualquier unidad de negocio.
- **Suscripción** (D24, D30): durante la prueba piloto todo es gratis ("Piloto gratis"). Después, el Gerente contrata y administra el pago en la web (Stripe Checkout y Customer Portal, en MXN); el Coordinador solo ve el estado. En la app, "Más → Suscripción" muestra estado, plan y avisos, sin precios para contratar ni botones o enlaces a la compra: solo dice que se administra desde la web (reglas de las tiendas, docs/tiendas.md).

### Coordinador (app y web)
- Registro por enlace del Gerente: nombre, correo, teléfono y contraseña. No vuelve a registrar la empresa.
- Ve y opera solo **sus unidades de negocio**: sus camiones, operadores, negociaciones y viajes.
- Disponibilidad de sus unidades (dónde y desde cuándo queda libre cada una) y rutas habituales de la empresa.
- **Cargas recomendadas**, incluido el modo **viaje de regreso**, y notificaciones de cargas nuevas cercanas a sus camiones disponibles y compatibles.
- Búsqueda y filtro de cargas, con detalle de la carga (mapa y distancia en vacío).
- **Ruta sugerida** de cada carga (D31): el corredor del catálogo por donde conviene ir, las **casetas estimadas** para la clase del camión (por número de ejes) con su fuente y fecha, y los **avisos de tramos inseguros** a la hora en que pasaría el camión. Las recomendaciones muestran "Casetas ~$X" y el aviso, y puntúan el precio sin casetas. Lo que no tiene fuente dice "Sin dato".
- En sus rutas habituales, **tramos preferidos y tramos a evitar**: la ruta sugerida los respeta.
- **Tiempos de espera** (D32), medidos con los eventos de los viajes: "Espera típica en descarga" en los viajes de regreso (y la hora en que la unidad queda libre los usa), "Espera típica al cargar" en la ruta sugerida de la carga y el **fin estimado de descarga** de cada viaje. Con menos de 5 viajes medidos se usan 4 h y se dice; las estadísticas con viajes de otras empresas solo se muestran si vienen de al menos 2.
- Ofertar y contraofertar (precio y disponibilidad), con chat con el cliente.
- Confirmar camión y operador del viaje ganado; ver si el cliente ya lo dio de alta como proveedor.
- **Enviar viaje al operador** (D29): al asignar, y mientras el viaje esté en curso, le manda al operador un enlace del viaje. En la app, con la hoja de compartir del sistema; en la web, "Enviar por WhatsApp" (al teléfono del operador), "Enviar por SMS", "Copiar enlace" y "Revocar". El enlace solo abre con la sesión del operador asignado y vence al cambiar de operador, al cerrar o cancelar el viaje, o a los 30 días. La notificación de viaje asignado sigue.
- Subir los documentos del viaje (D22): orden de servicio, CFDI con Carta Porte y factura.
- **Compartir** una carga por enlace con operadores u otros coordinadores de la empresa (D23).
- Monitorear viajes activos en el mapa y consultar el historial.
- **Chat interno del viaje** con el operador (D28): en el detalle del viaje, el chat tiene dos pestañas, "Cliente" e "Interno". El cliente nunca ve el interno. En el inicio de la app, la tarjeta "Mensajes de operadores (n)" con los viajes que tienen mensajes sin leer; en la web, un distintivo de no leídos en la lista de viajes.
- Cuando un viaje que ya salió se cancela: confirmar dónde quedó el camión y **liberarlo** (D20).
- Invitar operadores a sus unidades de negocio y restablecerles el acceso.

### Operador (app móvil)
- Registro por enlace: nombre, teléfono y contraseña; correo opcional; identificación oficial y licencia de conducir vigente y adecuada al vehículo.
- Notificación de viaje asignado y pantalla del viaje: origen, destino, ruta, instrucciones, contactos y documentos del viaje.
- **Viaje por enlace** (D29): el enlace que le manda su coordinador (`https://<sitio>/viaje/<token>` o `transport://viaje/<token>`) abre la app en su viaje; sin sesión, le pide entrar con su teléfono y contraseña y después lo abre. Si no es el viaje en curso, lo ve como "Siguiente viaje" en solo lectura. Un enlace vencido, revocado o de otro operador dice "Este enlace ya no está disponible. Pide uno nuevo a tu coordinador." La página web del enlace no muestra datos del viaje: solo "Abrir en la app" y, si están configuradas, las tiendas.
- Botones de estado:
  - salida
  - llegada a recolección
  - inicio y fin de carga
  - en tránsito
  - llegada a destino
  - inicio de descarga, con **hora estimada de fin de descarga** (la sugerida sale de la descarga típica del sitio, D32; si no hay suficientes viajes medidos, 4 h)
  - fin de descarga
- **Ubicación compartida en segundo plano**, con consentimiento explícito y solo durante viajes activos. La app le pide activar la **ubicación precisa** y el permiso **"Siempre"** (D17).
- Evidencia de recolección y evidencia firmada de entrega (fotos con hora y ubicación, y quién recibe). Funciona sin señal y sube después.
- Reportar incidencias (con fotos).
- **"Reportar al coordinador"** (D28): el botón principal de su viaje abre el chat interno con su coordinador (y el Gerente), con mensajes rápidos ("Ya llegué a cargar", "Ya llegué a descargar", "Voy con retraso", "Estoy esperando turno", "Tengo un problema en carretera", "Todo en orden"), "Enviar foto" y "Enviar mi ubicación". Avisa por push. Sigue abierto si el viaje se cancela o termina (D20-E1).
- El operador **no ve el chat con el cliente** (D28): habla con su coordinador y el coordinador con el cliente.

### Hombre-camión (app y web)
- En el registro elige "Hombre camión": una sola cuenta crea la empresa, su perfil de Gerente y su perfil de Operador (D13).
- Mientras trabaje solo, la app y la web le ocultan el chat interno del viaje, que sería consigo mismo; sigue en el chat con el cliente (D13-E1, D28).
- Sube sus documentos fiscales, personales (identificación y licencia) y del camión.
- Hace todo lo del Gerente y del Operador: buscar cargas, ofertar, aceptar viajes, compartir ubicación y subir evidencias. Paga la suscripción como Gerente, en la web (D13-E1, D30).

### Admin (web)
- Cola de verificación de empresas, documentos, unidades y operadores: aprobar o rechazar con motivo.
- Usuarios: buscar, suspender y reactivar.
- Supervisión de cargas y viajes, con asignación manual.
- Incidencias: seguimiento y resolución.
- **Suscripciones** (D30): la bandera de la prueba piloto, su fecha de fin (avisa 14 días antes), el modo sin suscripción después del piloto (apagado, aviso o bloqueo de ofertas y disponibilidad nuevas; nunca de viajes en curso), los planes (hombre camión y empresa transportista, precio "Por definir" hasta que se fije) y el estado de cada empresa transportista. Cada cambio queda en la bitácora.
- Estadísticas básicas: cargas publicadas, ofertas, viajes, viajes de regreso logrados y km en vacío.
- Bitácora de auditoría de acciones administrativas.
- **Carreteras** (D31): tramos, casetas por clase de camión, inseguridad por tramo y franja horaria, y corredores; cada dato con su fuente y fecha, y la marca "estimado" o "verificado". Los cambios quedan en la bitácora.

### Transversal
- Notificaciones push (móvil) y por email (web) cuando hay:
  - una carga nueva compatible (al coordinador de la unidad de negocio con el camión compatible, y al Gerente)
  - una oferta o contraoferta
  - una aceptación
  - una asignación (al operador)
  - un cambio de estado del viaje
  - un documento del viaje nuevo, o documentos compartidos
  - una unidad pendiente de liberar
  - un documento aprobado, rechazado o por vencer
  - un mensaje del chat interno del viaje (solo push y bandeja, nunca correo; los mensajes seguidos se agrupan en un aviso, D28)
  - la prueba piloto por terminar (14 días antes) o una suscripción no activa después del piloto (banner en la web y la app del transportista, D30)
- Alertas de **documentos por vencer** (licencias, seguros y demás documentos con vigencia).
- Aviso de privacidad (LFPDPPP) y términos, con consentimiento de ubicación registrado.

### Flujo principal (D19–D22)

1. El **cliente** publica una carga (origen, destino, fecha, mercancía y precio).
2. El **coordinador** ve las cargas, o recibe una notificación de una carga cercana a un camión disponible y compatible de su unidad de negocio.
3. El coordinador **oferta** precio y disponibilidad (con el camión que propone).
4. El cliente compara las ofertas y **elige** una. Se crea el viaje.
5. La plataforma **comparte automáticamente** al cliente los documentos aprobados de la empresa transportista; al asignar, también los de la unidad y el operador (D21).
6. Si el cliente lo necesita, **da de alta** al transportista como proveedor (D21).
7. El coordinador **confirma camión y operador**.
8. El coordinador **sube la documentación del viaje** (orden de servicio y CFDI con Carta Porte; D22). El cliente también puede subir la orden de servicio.
9. El **operador** recibe la notificación, ejecuta el viaje, comparte ubicación y sube la evidencia de recolección y la evidencia firmada de entrega.
10. El cliente confirma la entrega y el coordinador **sube la factura** para cobrar (el cobro del flete es fuera de la plataforma, D08-E1).

**Cancelación de un viaje que ya salió (D20):** se registra con motivo; la unidad queda "No disponible: pendiente de liberar"; el coordinador confirma la ubicación actual y la libera; la unidad vuelve a tener disponibilidad ahí y la app le recomienda cargas cercanas.

## 4. Fuera de la V1

Hardware propio, pago del flete dentro de la plataforma y comisiones, emisión o validación de Carta Porte, predicción de disponibilidad con IA, comparación de fotos con IA, inglés, calificaciones y reputación, e integración con GPS de terceros o de flotas (D17). La suscripción está en la V1 (D24-E1, D30) con el piloto **gratis**: mientras la bandera de piloto esté activa nadie paga y nada se bloquea. Fuera: cobro del flete y comisiones, factura CFDI de la suscripción, OXXO y transferencia, precio por camión o por usuario y cupones. Los datos de la V1 (eventos con hora y fotos con metadatos) se guardan pensando en las funciones de IA.

## 5. Indicadores de éxito del piloto (MTY ↔ GDL)

- Viajes de regreso conseguidos por la plataforma (la meta del deck son los primeros 5)
- Km en vacío evitados por viaje
- Tiempo desde que se publica una carga hasta la primera oferta
- Tiempo desde que se publica hasta que se contrata
- Tiempo de alta de un transportista (registro → aprobado)
- Precisión del fin estimado de descarga frente al real (sirve de base para la futura predicción)

## 6. Permisos por perfil

✅ puede · 🔸 solo en sus unidades de negocio · 👁 solo lectura · — no

| Acción | Cliente | Gerente | Coordinador | Operador | Admin |
|---|---|---|---|---|---|
| Registrar y editar la empresa y sus documentos | ✅ (la suya) | ✅ (la suya) | 👁 | — | ✅ |
| Crear, renombrar y archivar unidades de negocio | — | ✅ | — | — | — |
| Invitar coordinadores y asignarlos a unidades de negocio | — | ✅ | — | — | — |
| Alta, edición, cambio de unidad de negocio y baja de camiones | — | ✅ | 🔸 editar datos operativos y documentos | — | — |
| Invitar operadores, restablecerles el acceso | — | ✅ | 🔸 | — | — |
| Cambiar de unidad de negocio o dar de baja operadores | — | ✅ | — | — | — |
| Disponibilidad de camiones | — | ✅ | 🔸 | — | — |
| Ver cargas publicadas, recomendaciones | — | ✅ | 🔸 (con sus camiones) | — | ✅ |
| Ofertar, contraofertar y chatear en negociaciones | ✅ | ✅ | 🔸 | — | 👁 |
| Chat del viaje con el cliente | ✅ | ✅ | 🔸 | — | 👁 |
| Chat interno del viaje (D28) | — | ✅ | 🔸 | ✅ (su viaje actual) | 👁 |
| Asignar camión y operador | — | ✅ | 🔸 | — | ✅ |
| Ver viajes | ✅ (los suyos) | ✅ (todos) | 🔸 | ✅ (el asignado) | ✅ |
| Subir documentos del viaje | ✅ orden de servicio | ✅ | 🔸 | 👁 | 👁 |
| Registrar estados, ubicación y evidencia | — | — (sí como hombre-camión) | — | ✅ (su viaje) | — |
| Cancelar un viaje | ✅ (hasta la recolección) | ✅ | 🔸 | — | ✅ |
| Liberar una unidad pendiente | — | ✅ | 🔸 | — | ✅ |
| Ver documentos compartidos del transportista | ✅ (de sus viajes) | — | — | — | ✅ |
| Dar de alta a un transportista como proveedor | ✅ | — | — | — | 👁 |
| Compartir por enlace | ✅ carga y seguimiento (público) | ✅ carga (interno) | 🔸 carga (interno) | — | — |
| Enviar el viaje al operador por enlace (D29) | — | ✅ | 🔸 | ✅ abrirlo (su viaje) | — |
| Marcar tramos preferidos o a evitar en las rutas habituales (D31) | — | ✅ | ✅ (rutas de la empresa) | — | 👁 |
| Editar el catálogo de carreteras: tramos, casetas, inseguridad y corredores (D31) | — | — | — | — | ✅ |
| Pagar y administrar la suscripción (D30; gratis durante el piloto) | — | ✅ (web) | 👁 estado | — | 👁 |

## 7. Glosario

- **Carga:** necesidad de transporte publicada por un cliente.
- **Negociación:** conversación entre un cliente y un transportista (una unidad de negocio) sobre una carga. Contiene ofertas y chat.
- **Oferta:** propuesta de precio y condiciones de una de las partes.
- **Viaje:** carga contratada y en ejecución, con unidad y operador asignados.
- **Unidad** (o camión): tractocamión, camión unitario o remolque de la flota.
- **Unidad de negocio** (grupo): conjunto de camiones y operadores de una empresa transportista que opera uno o varios coordinadores.
- **Disponibilidad:** momento y lugar en que una unidad queda libre.
- **Pendiente de liberar:** estado de una unidad cuyo viaje se canceló después de salir; vuelve a estar disponible cuando el coordinador confirma dónde quedó.
- **Proveedor aprobado:** transportista que un cliente dio de alta como proveedor.
- **Enlace compartido:** enlace con token para ver una carga o un seguimiento sin ser parte del viaje.
- **Km en vacío:** distancia que recorre la unidad sin carga para llegar a la recolección.
- **Viaje de regreso:** carga que sale cerca del destino del viaje actual, en sentido de regreso.
