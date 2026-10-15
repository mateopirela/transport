# Análisis inicial: deck + reunión JP / Mateo (14 oct 2026)

Fuentes: `APP TRANSPORTE MEXICO.pdf` (38 diapositivas, de JP) y las notas de Granola de la reunión ([kickoff-meeting-notes.md](kickoff-meeting-notes.md)).

## La tesis en una línea

**Conseguir el siguiente viaje antes de que el camión termine el actual.** El problema de fondo no es "conectar cargas" (BeGo ya lo hace), sino los **regresos vacíos** y la **incertidumbre de cuándo queda libre el camión** (descargas de 3 a 10 días).

## Dónde el deck y la reunión no coinciden

| Tema | Deck | Reunión | Recomendación |
|---|---|---|---|
| Comunicación | "WhatsApp o mensajería básica" | Chat dentro de la app, por trazabilidad y temas legales | Chat in-app. Actualizar el deck |
| Idioma | Español e inglés | Español primero, inglés al expandir | Solo español en V1, pero con textos preparados para traducir (i18n) |
| GPS | "Planeado futuro" en la tabla comparativa, pero es el paso 8 del flujo | Central; acceso al GPS de la empresa de JP | Ubicación desde el teléfono en V1 |
| Documentación | "Planeado futuro" | RFC y permisos se suben al registrarse (base de la confianza) | Documentos de empresa y evidencia fotográfica en V1 |
| Plataformas | Apps iOS/Android **y** web para computadora | "Una sola app con vistas por perfil" | Apps móviles para transportista y operador, web para cliente y admin, con un solo backend |
| IA para fotos | No aparece | Comparar fotos de carga y entrega | Guardar las fotos desde V1 y añadir la IA después |
| Hardware propio | No aparece | Se propuso, con dudas de escala (50,000 unidades) | Posponer. Contradice "reglas antes que IA compleja" y "administrar costos tecnológicos" |

## Lo más valioso que no está explícito

1. **El dato de "cuándo se libera el camión" es la ventaja competitiva.** Predecir disponibilidad (diapositiva 16) requiere historial. Desde V1 hay que registrar cada evento con hora (llegada, inicio y fin de descarga) para que el modelo tenga datos después. Sin esos datos no habrá IA útil.
2. **Carta Porte no es opcional en México.** El transporte de carga necesita CFDI con complemento Carta Porte. Hay que definir si la plataforma lo emite, lo valida o solo lo almacena. Va en la pregunta legal que tiene JP.
3. **Problema del huevo y la gallina.** La empresa de JP resuelve la oferta (camiones). Falta demanda: empresas que manden carga **Guadalajara → Monterrey**, que es el tramo de regreso. Esa es la meta de validación más importante.
4. **Pagos.** El admin "supervisa pagos", pero no está definido si el dinero pasa por la plataforma (escrow o comisión) o se paga por fuera. Eso cambia la arquitectura y las obligaciones fiscales.
5. **El propio deck dice que primero hay que validar** (20 transportistas, 20 empresas, 5 viajes de regreso) "antes de invertir fuertemente en desarrollo". El MVP debe ser chico.

## Propuesta de alcance V1 (MVP)

**Incluido:**
- Registro por perfil y verificación **manual** por el admin (RFC y documentos)
- Cliente: publicar carga, recibir ofertas y contraofertas, contratar
- Transportista: unidades, operadores, rutas habituales y disponibilidad. Cargas recomendadas **por reglas** (filtrar, verificar compatibilidad, calcular distancia y ordenar)
- Chat in-app por carga
- Operador: viaje asignado, estados con hora, ubicación desde el teléfono, fotos de carga y entrega, incidencias
- Admin: aprobar empresas, ver cargas y viajes, asignación manual, incidencias
- Notificaciones push

**Fuera de V1:** predicción con IA, comparación de fotos con IA, hardware, pagos dentro de la app, emisión de Carta Porte, suscripciones, inglés.

## Decisiones pendientes (bloquean o moldean el desarrollo)

- [ ] Acuerdo de sociedad: roles, equity/compensación y presupuesto (antes de construir mucho)
- [ ] Lista de documentos legales por perfil (JP)
- [ ] Carta Porte: ¿emitir, validar o almacenar?
- [ ] Pagos: ¿por la plataforma o por fuera en V1?
- [ ] GPS: ¿API del proveedor de la empresa de JP o solo el teléfono?
- [ ] GPS en segundo plano (implica permisos "siempre" en iOS/Android y revisión de las tiendas)
- [ ] Stack tecnológico
