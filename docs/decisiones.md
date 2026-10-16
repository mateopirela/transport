# Registro de decisiones

Cada decisión tiene fecha y estado. Si algo cambia, se agrega una entrada nueva en lugar de borrar la anterior.

| # | Fecha | Decisión | Estado |
|---|---|---|---|
| D01 | 2026-10-14 | La comunicación cliente–transportista es por **chat dentro de la app**, no por WhatsApp (trazabilidad y respaldo legal) | Confirmada |
| D02 | 2026-10-14 | La V1 es **solo en español**. Precios en **MXN** y horario `America/Mexico_City` | Confirmada |
| D03 | 2026-10-14 | **GPS y documentación entran desde la V1** | Confirmada |
| D04 | 2026-10-14 | El **hardware propio** (dispositivo en cabina) queda fuera de alcance por ahora | Confirmada |
| D05 | 2026-10-14 | Stack: **Expo (React Native)** para móvil, **Next.js** para web y **Supabase** (Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions) como backend único | Confirmada |
| D06 | 2026-10-14 | Reparto de plataformas: **app móvil** para Transportista y Operador; **web** para Cliente y Admin | Confirmada |
| D07 | 2026-10-14 | Las recomendaciones de la V1 se hacen **por reglas** (filtrar → verificar → calcular → ordenar). La IA llega después | Confirmada |
| D08 | 2026-10-14 | **Pagos fuera de la plataforma en V1.** Solo se registra el precio acordado | Confirmada |
| D09 | 2026-10-14 | **Carta Porte:** en V1 solo se almacena como documento del viaje; no se emite ni se valida | Confirmada |
| D10 | 2026-10-14 | La verificación de empresas y documentos es **manual por el Admin** en V1 | Confirmada |
| D11 | 2026-10-14 | Cada evento del viaje se guarda con **hora y ubicación** (llegada, inicio y fin de carga y descarga), para entrenar después la predicción de disponibilidad | Confirmada |
| D12 | 2026-10-14 | La lista de documentos requeridos se guarda **como datos** (tabla de requisitos) y no fija en el código, para cargar después la lista de JP sin migraciones de lógica | Confirmada |
| D13 | 2026-10-14 | Un transportista independiente ("hombre-camión") puede registrarse **también como operador** de su propia empresa | Propuesta |
| D14 | 2026-10-14 | Gate de merge: **se hace merge cuando Greptile aprueba el PR.** Si no lo aprueba, se corrige y se vuelve a revisar hasta que lo apruebe. No hay aprobación humana por PR | Confirmada |
| D15 | 2026-10-14 | Los operadores entran con **email y contraseña mediante invitación** de su transportista. No hay OTP por SMS | Confirmada |
| D16 | — | Lista oficial de documentos legales por perfil (JP) | Pendiente |
| D17 | — | ¿Integrar la API del GPS de la flota de JP? (V1 usa la ubicación del teléfono) | Pendiente |
| D18 | 2026-10-16 | **Borrado de cuenta y chat:** al borrar una cuenta, sus mensajes se conservan para la contraparte y para disputas, pero se anonimizan: el remitente (`messages.sender_id`) pasa a nulo y el resto del mensaje (rol, texto, adjuntos, hora) no cambia. La web y la app lo muestran como "Cuenta eliminada". Ver el PR #36 (F6) | Propuesta, pendiente de confirmar por Mateo |
