# Registro de decisiones

Cada decisión tiene fecha y estado. Si algo cambia, se agrega una entrada nueva en lugar de borrar la anterior.

| # | Fecha | Decisión | Estado |
|---|---|---|---|
| D01 | 2026-10-14 | La comunicación cliente–transportista es por **chat dentro de la app**, no por WhatsApp (trazabilidad y respaldo legal) | Confirmada |
| D02 | 2026-10-14 | La V1 es **solo en español**. Precios en **MXN** y horario `America/Mexico_City` | Confirmada |
| D03 | 2026-10-14 | **GPS y documentación entran desde la V1** | Confirmada |
| D04 | 2026-10-14 | El **hardware propio** (dispositivo en cabina) queda fuera de alcance por ahora | Confirmada |
| D05 | 2026-10-14 | Stack: **Expo (React Native)** para móvil, **Next.js** para web y **Supabase** (Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions) como backend único | Confirmada |
| D06 | 2026-10-14 | Reparto de plataformas: **app móvil** para Transportista y Operador; **web** para Cliente y Admin | Confirmada; enmendada el 2026-10-16 (D06-E1) |
| D07 | 2026-10-14 | Las recomendaciones de la V1 se hacen **por reglas** (filtrar → verificar → calcular → ordenar). La IA llega después | Confirmada |
| D08 | 2026-10-14 | **Pagos fuera de la plataforma en V1.** Solo se registra el precio acordado | Confirmada; enmendada el 2026-10-16 (D08-E1) |
| D09 | 2026-10-14 | **Carta Porte:** en V1 solo se almacena como documento del viaje; no se emite ni se valida | Confirmada |
| D10 | 2026-10-14 | La verificación de empresas y documentos es **manual por el Admin** en V1 | Confirmada |
| D11 | 2026-10-14 | Cada evento del viaje se guarda con **hora y ubicación** (llegada, inicio y fin de carga y descarga), para entrenar después la predicción de disponibilidad | Confirmada |
| D12 | 2026-10-14 | La lista de documentos requeridos se guarda **como datos** (tabla de requisitos) y no fija en el código, para cargar después la lista de JP sin migraciones de lógica | Confirmada |
| D13 | 2026-10-16 | **Hombre-camión = Gerente + Operador en una sola cuenta.** El registro tiene la opción "Hombre camión": la persona se registra una vez (nombre, correo, teléfono y contraseña), sube sus documentos personales, fiscales y del camión, y la app le activa los perfiles de Gerente y Operador de su propia empresa. Con esa cuenta busca cargas, oferta, acepta viajes, comparte ubicación, sube evidencias y paga la suscripción. En datos: `profiles.role = 'manager'`, `companies.is_owner_operator = true` y una fila de `operators` ligada a su propio perfil (B04 ya lo permite). Antes (2026-10-14, propuesta): "puede registrarse también como operador de su propia empresa" | Confirmada |
| D14 | 2026-10-14 | Gate de merge: **se hace merge cuando Greptile aprueba el PR.** Si no lo aprueba, se corrige y se vuelve a revisar hasta que lo apruebe. No hay aprobación humana por PR | Confirmada |
| D15 | 2026-10-14 | Los operadores entran con **email y contraseña mediante invitación** de su transportista. No hay OTP por SMS | Confirmada; enmendada el 2026-10-16 (D15-E1) |
| D16 | 2026-10-16 | **Documentos por perfil (lista de JP).** Se cargan como datos (D12) y reemplazan la lista provisional de B03. Detalle en la sección "D16" de abajo | Confirmada |
| D17 | 2026-10-16 | **GPS: en V1 solo el teléfono del operador.** La app le pide activar la ubicación **precisa** y con permiso **"Siempre"**, y le avisa mientras no lo esté. La integración con las API de GPS de las flotas (los monitoristas de los coordinadores tienen el GPS del camión 24/7) queda para después de la V1 | Confirmada |
| D18 | 2026-10-16 | **Borrado de cuenta y chat:** al borrar una cuenta, sus mensajes se conservan para la contraparte y para disputas, pero se anonimizan: el remitente (`messages.sender_id`) pasa a nulo y el resto del mensaje (rol, texto, adjuntos, hora) no cambia. La web y la app lo muestran como "Cuenta eliminada". Ver el PR #36 (F6) | Propuesta, pendiente de confirmar por Mateo |
| D19 | 2026-10-16 | **Cuatro perfiles y unidades de negocio.** El transportista se divide en **Gerente** (`manager`, el rol que antes se llamaba `carrier`) y **Coordinador** (`coordinator`). El Gerente registra la empresa (lo legal), los camiones y los operadores; organiza los camiones en **unidades de negocio** (grupos) y asigna coordinadores a cada una; invita coordinadores por enlace; supervisa todos los viajes; y administra y paga la suscripción. El Coordinador opera **solo** las unidades de negocio que tiene asignadas: sus camiones, sus operadores, las negociaciones y ofertas que hizo su unidad y sus viajes; busca cargas, negocia, asigna, supervisa entregas y escribe al cliente. Cliente y Operador no cambian. Una empresa transportista siempre tiene al menos una unidad de negocio ("Principal"). Modelo en [plan-v1.md §G](plan-v1.md) (G1) | Confirmada |
| D20 | 2026-10-16 | **Cancelación de un viaje que ya salió.** Se registra la cancelación con motivo obligatorio. La unidad queda **"No disponible: pendiente de liberar"** y su coordinador recibe la tarea de confirmar dónde está el camión y si quedó libre. Cuando el coordinador (o el Gerente) la libera, la unidad vuelve a estar disponible en esa ubicación y la app vuelve a recomendarle cargas cercanas. Si el viaje se cancela **antes** de salir, sigue la regla de F5/F13: la unidad recupera la disponibilidad que tenía | Confirmada |
| D21 | 2026-10-16 | **Documentos compartidos al cliente y alta de proveedor.** Cuando el cliente acepta una oferta, la plataforma le comparte automáticamente, en solo lectura, los documentos **aprobados** de la empresa transportista que el catálogo marca como compartibles; cuando se asignan unidad y operador, también los de ellos. Cada consulta queda en bitácora y el acceso termina al cerrar o cancelar el viaje (o antes, si el Gerente lo revoca). El cliente puede **dar de alta** al transportista como proveedor aprobado, con estado por par cliente–transportista. En V1 el alta es informativa: no bloquea la asignación | Confirmada |
| D22 | 2026-10-16 | **Documentos por viaje.** Antes de salir: orden de servicio (la sube el cliente o el coordinador) y CFDI con complemento Carta Porte (coordinador). Al recoger: evidencia de recolección (operador). Al entregar: evidencia firmada de entrega (operador). Para cobrar: factura, si no se emitió antes (coordinador). La lista vive como datos (D12); en V1 lo que falta se **avisa** y no bloquea la salida (cada documento puede configurarse para bloquear). D09 se mantiene: la Carta Porte solo se almacena | Confirmada |
| D23 | 2026-10-16 | **Compartir por enlace.** El coordinador comparte una carga con operadores u otros coordinadores **de su empresa** (enlace interno: se abre con sesión iniciada). El cliente comparte una carga o el seguimiento de un viaje con un enlace **público de solo lectura**: token aleatorio, con vencimiento y revocable, sin precio, contactos, documentos ni chat | Confirmada |
| D24 | 2026-10-16 | **Suscripción de la plataforma.** La empresa transportista (su Gerente, o el hombre-camión) paga una suscripción con **Stripe** en MXN. Estados: Piloto gratis, Activa, Vencida y Cancelada. La prueba piloto es **gratis**: sin claves de Stripe, todas las empresas quedan en "Piloto gratis" y el apartado de suscripción lo explica. Sin suscripción activa después del piloto solo hay **avisos** (en V1 no se bloquea nada). El pago y la administración se hacen en la **web** (Stripe Checkout y Customer Portal); la app muestra el estado y remite a la web. El código no crea cuentas ni productos de Stripe . **Pospuesta por Mateo (2026-10-16): no se construye todavía.** El piloto es gratis y no hay pantallas de suscripción; G8 queda fuera de la ola actual | Pospuesta |
| D25 | — | Nombre comercial de la plataforma (mientras tanto, "Transport") | Pendiente |

## Enmiendas del 2026-10-16

Salen de las respuestas de JP y Mateo al documento "Transport V1: preguntas pendientes para el piloto" (2026-10-16) y de las elecciones de Mateo en el chat del mismo día. El texto original de cada decisión sigue arriba.

| # | Enmienda | Estado |
|---|---|---|
| D06-E1 | El **Gerente y el Coordinador usan la app móvil y la web**. La web suma un área de transportista (cargas, ofertas, viajes, flota, gestión de la empresa y suscripción). El Operador sigue solo en la app; Cliente y Admin, solo en la web | Confirmada |
| D08-E1 | El **flete sigue fuera de la plataforma**: solo se registra el precio acordado y, en la prueba piloto, la plataforma no cobra comisión. Lo único que se cobra dentro de la plataforma es la **suscripción** (D24) | Confirmada |
| D15-E1 | El Operador se registra con un **enlace de invitación** de su Gerente o Coordinador: nombre, **teléfono y contraseña**, y correo opcional. Entra con **teléfono + contraseña**. No hay SMS ni OTP (no hay proveedor). La cuenta de Supabase Auth la crea una Edge Function con un correo interno sintético derivado del teléfono, en un dominio `.invalid` que nunca recibe correo (G2 en [plan-v1.md §G](plan-v1.md)). Si olvida la contraseña, su Gerente o Coordinador le genera un enlace para restablecer el acceso. Los operadores que ya entran con correo lo siguen haciendo | Confirmada |

## D16 · Documentos por perfil (lista de JP)

| Perfil | Datos del registro | Documentos |
|---|---|---|
| **Transportista: empresa** (la registra el Gerente) | RFC y razón social, domicilio fiscal, nombre del representante legal | Constancia de Situación Fiscal; identificación del representante legal |
| **Gerente** | Nombre, correo, teléfono y contraseña | — |
| **Coordinador** (por enlace del Gerente; no vuelve a registrar la empresa) | Nombre, correo, teléfono y contraseña | — |
| **Cliente: empresa** | RFC y razón social, domicilio fiscal, nombre del representante legal (cuando se requiera) | Constancia de Situación Fiscal; identificación del representante legal (cuando se requiera) |
| **Cliente: usuario** | Nombre, correo, teléfono y contraseña | — |
| **Operador** (por enlace) | Nombre, teléfono y contraseña; correo opcional | Identificación oficial (INE u otra válida); licencia de conducir vigente y adecuada al vehículo |
| **Unidad** (la registra el Gerente) | Placas, tipo de unidad y capacidad | Tarjeta de circulación; permisos correspondientes; seguro vigente. Se actualizan cuando cambian o vencen |
| **Viaje** | — | Ver D22 |

De la lista provisional de B03 salen el acta constitutiva, el comprobante de domicilio y, **a nivel empresa**, el permiso SCT/SICT y la póliza de seguro (pasan a ser documentos de cada unidad). Sus filas se archivan, no se borran.
