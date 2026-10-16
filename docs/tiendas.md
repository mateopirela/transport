# Fichas de las tiendas (B27)

Textos para App Store Connect y Google Play Console de la app móvil (Transportista y Operador). En la V1 la app se distribuye solo en **pruebas internas** (TestFlight y la pista interna de Play), pero Apple y Google revisan igual los permisos de ubicación, así que estos textos se cargan desde la primera build. Pasos de despliegue: [release.md](release.md).

> El nombre comercial definitivo, los íconos y las capturas están pendientes. "Transport" es el nombre de trabajo.

## Datos generales

| Campo                     | Valor                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Nombre                    | Transport                                                              |
| Subtítulo (iOS, 30 car.)  | Cargas y viajes de regreso                                             |
| Categoría                 | Negocios (secundaria: Navegación)                                      |
| Idioma                    | Español (México)                                                       |
| Clasificación             | 4+ / Para todos                                                        |
| Aviso de privacidad (URL) | `https://<dominio>/aviso-de-privacidad`                                |
| Términos (URL)            | `https://<dominio>/terminos`                                           |
| Soporte (URL o correo)    | `[CORREO DE SOPORTE]`                                                  |
| Público                   | Empresas de autotransporte y sus operadores; requiere cuenta verificada |

## Descripción corta (Play, 80 caracteres)

Consigue tu siguiente viaje antes de terminar el actual. Menos kilómetros vacíos.

## Descripción

Transport conecta a transportistas con empresas que necesitan mover carga, y te recomienda viajes de regreso para que tus camiones no vuelvan vacíos.

Para el transportista:

- Registra tu empresa, tus unidades y tus operadores, con sus documentos.
- Recibe cargas recomendadas para cada unidad, incluidas las que salen cerca del destino de un viaje en curso.
- Oferta, contraoferta y negocia por chat dentro de la app.
- Asigna unidad y operador a cada viaje y síguelo en el mapa.

Para el operador:

- Consulta el viaje asignado: origen, destino, instrucciones y contactos.
- Registra cada etapa con un botón: salida, llegada, carga, tránsito, descarga y entrega.
- Toma fotos de evidencia, incluso sin señal: se envían después.
- Comparte tu ubicación solo durante el viaje, con tu consentimiento.

La app requiere una cuenta de empresa verificada por nuestro equipo. Piloto en la ruta Monterrey ↔ Guadalajara.

## Justificación del uso de ubicación

### iOS (App Review)

La app usa `UIBackgroundModes: location` y pide "Siempre". Los textos que ve el usuario están en `packages/shared/src/copy/permissions.ts`. Nota para el revisor:

> La ubicación en segundo plano solo la usan los **operadores** (conductores) durante un **viaje activo**: empieza cuando el operador registra "Salir a recoger" y se detiene sola al registrar la entrega. Sirve para que el transportista y el cliente sigan la carga y para estimar la llegada. Antes de pedir el permiso, la app muestra una pantalla propia que explica qué se comparte, cuándo y quién lo ve, y registra la aceptación; el operador puede retirarla en "Más". Fuera de un viaje no se registra la ubicación. Cuenta de prueba: `[CORREO]` / `[CONTRASEÑA]` (operador con un viaje asignado).

### Android (Play Console → Contenido de la app → Permisos de ubicación)

- **Función que usa la ubicación en segundo plano:** seguimiento del viaje activo de un operador de carga.
- **Por qué necesita segundo plano:** el operador maneja con la pantalla apagada o usa otras apps (navegación); el cliente y el transportista necesitan ver la posición de la carga durante todo el trayecto. Mientras se comparte hay una notificación fija (servicio en primer plano de tipo `location`).
- **Video (obligatorio):** grabar en un Android real: inicio de sesión del operador → pantalla de consentimiento → permiso "Permitir todo el tiempo" → "Salir a recoger" → notificación fija → registrar la entrega → la notificación desaparece. Subirlo como enlace de YouTube no listado.

## Privacidad de los datos

Respuestas para _App Privacy_ (Apple) y _Seguridad de los datos_ (Google). Deben coincidir con el aviso de privacidad.

| Dato                                      | Se recopila | Vinculado al usuario | Para qué                                     | Se comparte con terceros         |
| ----------------------------------------- | ----------- | -------------------- | -------------------------------------------- | -------------------------------- |
| Nombre, correo, teléfono                  | Sí          | Sí                   | Funcionalidad de la app, cuenta              | Con la otra parte del viaje      |
| Ubicación precisa (incluye segundo plano) | Sí          | Sí                   | Funcionalidad de la app (seguimiento)        | Con la otra parte del viaje      |
| Fotos (documentos y evidencia)            | Sí          | Sí                   | Funcionalidad de la app                      | Con la otra parte del viaje      |
| Mensajes del chat                         | Sí          | Sí                   | Funcionalidad de la app                      | Con la otra parte de la negociación |
| Identificadores del dispositivo (push)    | Sí          | Sí                   | Notificaciones                               | No                               |
| Diagnóstico (errores)                     | Sí          | Sí (id interno)      | Análisis y corrección de errores             | No                               |
| Interacción con el producto               | Sí          | Sí (id interno)      | Analítica propia                             | No                               |

- No hay rastreo con fines publicitarios (sin ATT) ni venta de datos.
- Los datos viajan cifrados (HTTPS). El usuario puede pedir que se borre su cuenta escribiendo a `[CORREO DE PRIVACIDAD]`.

## Capturas (pendientes)

iPhone 6.9" y 6.5", y teléfono Android: cargas recomendadas, detalle de carga con mapa, negociación con chat, viaje del operador con los botones de estado y la pantalla de consentimiento de ubicación.
