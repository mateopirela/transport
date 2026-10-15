# Especificación de producto: V1

> Consolida el deck de JP, la reunión del 14 oct 2026 y las decisiones en [decisiones.md](decisiones.md). Las fuentes originales están en [fuentes/](fuentes/).

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

**Lanzamiento:** una sola ruta, **Monterrey ↔ Guadalajara**. El primer transportista es la empresa familiar de JP.

## 2. Perfiles

| Perfil | Quién es | Plataforma V1 |
|---|---|---|
| **Cliente** | Empresa que necesita mover carga | Web |
| **Transportista** | Empresa o dueño de camiones; administra flota, operadores y negociaciones | App móvil |
| **Operador** | Conductor que ejecuta el viaje | App móvil (misma app, vista de operador) |
| **Admin** | Equipo interno: verifica, supervisa y resuelve | Web |

Cada empresa (cliente o transportista) pasa por **verificación** antes de operar. Mientras está "en revisión" puede completar su perfil, pero no publicar cargas ni ofertar.

## 3. Funcionalidades V1 por perfil

### Cliente (web)
- Registro de empresa: razón social, RFC, contacto y documentos legales. La cuenta queda en revisión.
- Publicar carga con:
  - origen y destino (autocompletado de Google)
  - ventana de recolección y ventana de entrega
  - mercancía, tipo de carga, peso y volumen
  - tipo de unidad requerida y requisitos especiales
  - precio propuesto (MXN)
- Editar o cancelar publicaciones mientras no estén contratadas.
- Recibir ofertas, contraofertar, aceptar o rechazar. Cada negociación tiene su chat.
- Viajes activos e historial:
  - mapa en vivo
  - línea de tiempo de eventos
  - fotos de evidencia
  - documentos del viaje (incluida la Carta Porte que suba el transportista)
  - confirmación de entrega
- Reportar incidencias.

### Transportista (app móvil)
- Registro de empresa con documentos y verificación.
- Flota:
  - camiones y remolques: tipo de unidad, capacidad, características y documentos
  - operadores: invitación, licencia y documentos
- Rutas habituales y **disponibilidad** (dónde y desde cuándo queda libre cada unidad).
- **Cargas recomendadas**, incluido el modo **viaje de regreso**: para un camión con viaje activo, se recomiendan cargas que salen cerca de su destino después de su fin estimado de descarga.
- Búsqueda y filtro de cargas, con detalle de la carga (mapa y distancia en vacío).
- Ofertar y contraofertar, con chat por negociación.
- Asignar unidad y operador al viaje ganado.
- Monitorear viajes activos en el mapa y consultar el historial.

### Operador (app móvil)
- Viaje asignado: origen, destino, instrucciones y contactos.
- Botones de estado:
  - salida
  - llegada a recolección
  - inicio y fin de carga
  - en tránsito
  - llegada a destino
  - inicio de descarga, con **hora estimada de fin de descarga**
  - fin de descarga
- **Ubicación compartida en segundo plano**, con consentimiento explícito y solo durante viajes activos.
- Fotos de evidencia de recolección y entrega, con hora y ubicación. Funciona sin señal y sube después.
- Reportar incidencias (con fotos).

### Admin (web)
- Cola de verificación de empresas, documentos, unidades y operadores: aprobar o rechazar con motivo.
- Usuarios: buscar, suspender y reactivar.
- Supervisión de cargas y viajes, con asignación manual.
- Incidencias: seguimiento y resolución.
- Estadísticas básicas: cargas publicadas, ofertas, viajes, viajes de regreso logrados y km en vacío.
- Bitácora de auditoría de acciones administrativas.

### Transversal
- Notificaciones push (móvil) y por email (web) cuando hay:
  - una carga nueva compatible
  - una oferta o contraoferta
  - una aceptación
  - una asignación
  - un cambio de estado del viaje
  - un documento aprobado, rechazado o por vencer
- Alertas de **documentos por vencer**.
- Aviso de privacidad (LFPDPPP) y términos, con consentimiento de ubicación registrado.

## 4. Fuera de la V1

Hardware propio, pagos dentro de la plataforma, emisión o validación de Carta Porte, suscripciones y comisiones automáticas, predicción de disponibilidad con IA, comparación de fotos con IA, inglés, calificaciones y reputación, e integración con GPS de terceros. Los datos de la V1 (eventos con hora y fotos con metadatos) se guardan pensando en las funciones de IA.

## 5. Indicadores de éxito del piloto (MTY ↔ GDL)

- Viajes de regreso conseguidos por la plataforma (la meta del deck son los primeros 5)
- Km en vacío evitados por viaje
- Tiempo desde que se publica una carga hasta la primera oferta
- Tiempo desde que se publica hasta que se contrata
- Tiempo de alta de un transportista (registro → aprobado)
- Precisión del fin estimado de descarga frente al real (sirve de base para la futura predicción)

## 6. Glosario

- **Carga:** necesidad de transporte publicada por un cliente.
- **Negociación:** conversación entre un cliente y un transportista sobre una carga. Contiene ofertas y chat.
- **Oferta:** propuesta de precio y condiciones de una de las partes.
- **Viaje:** carga contratada y en ejecución, con unidad y operador asignados.
- **Disponibilidad:** momento y lugar en que una unidad queda libre.
- **Km en vacío:** distancia que recorre la unidad sin carga para llegar a la recolección.
- **Viaje de regreso:** carga que sale cerca del destino del viaje actual, en sentido de regreso.
