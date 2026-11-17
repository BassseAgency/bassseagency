# BASSSE MERCH — Contrato de experiencia de compra

**Estado:** especificación para revisión, no interfaz publicada. **Issue:** #32.

## Objetivo
Una tienda integrada en bassse.com con catálogo visual, propuestas de personalización, presupuesto y compra directa **solo cuando la tarifa de lote y los gastos estén verificados**. Preservar marca BASSSE (tres S), naranja oficial #E35D24, negro #000, blanco #FFF, logo sin modificaciones y tipografía Inter Tight de referencia; usar assets aprobados por dirección creativa.

## Navegación
`/merch` muestra categorías de merchandising: camisetas, sudaderas, lanyards, abanicos, pegatinas, llaveros, bragas, packaging, acreditaciones y otras familias del catálogo. Cada tarjeta muestra rango de cantidad, técnicas compatibles y estado comercial. Los precios de la edición 2026 no se muestran como precios de compra válidos hasta revisarlos.

`/merch/[slug]` contiene galería real del producto, especificaciones de fabricación, rango o lote mínimo, plazos *confirmados* y opciones de color/tamaño, método de impresión, cantidad y personalización.

## Estados comerciales
- **Borrador:** no visible públicamente y nunca pagable.
- **Solicitar presupuesto:** visible sin precio final, formulario de contacto y especificaciones; no activa Stripe.
- **Compra directa habilitada:** precio de lote aprobado, impuestos y transporte comprobados, capacidad confirmada. El servidor calcula el precio final a partir de referencias autorizadas, no del navegador.
- **No disponible:** ficha informativa sin botón de compra, con alternativa de contacto.

## Recorrido de cotización
Explorar → abrir ficha → escoger técnica/cantidad → adjuntar requisitos (cuando almacenamiento seguro esté implementado) → solicitar presupuesto → recibir confirmación de solicitud → BASSSE revisa → emite oferta con vigencia y condiciones → cliente acepta → pago Stripe TEST y posteriormente LIVE con autorización → archivo final y revisión → visto bueno explícito → producción → QC → envío.

## Recorrido de compra directa
Ficha + configuración validada → resumen de lote completo → identificación y dirección de envío → cálculo de impuestos/portes → pantalla de revisión final → Stripe Checkout → confirmación **solo tras webhook firmado** → estado de pedido → vista de archivos y prueba de arte → aprobación registrada → fabricación.

## Comportamientos obligatorios
- Si falta precio, impuestos, entrega o capacidad: mostrar **Solicitar presupuesto**; nunca valor de 0 € ni pagar.
- No aceptar fichero como aprobado solo por subirlo; versionado de arte y confirmación escrita.
- No llamar `paid` a un pago diferido no confirmado.
- El estado de pago y el de producción son ejes independientes.
- Subida de archivos por endpoint seguro; no exponer archivos de clientes por URL pública ni incluirlos en emails sin autorización.
- Diseño adaptativo: móvil 360–430 px, tablet 768–1024 px, desktop desde 1280 px. Revisar contenido y accesibilidad sin prometer que esas medidas abarcan todos los dispositivos.
- Accesibilidad WCAG 2.2 AA: teclado, focus visible, labels, mensajes de error, contraste y controles con tamaño adecuado.
- Campos de formulario necesarios: contacto y email, empresa opcional, producto/técnica, lotes/unidades, comentarios, dirección de entrega para calcular portes (cuando proceda), aceptación de política de privacidad.
- Transparencia: subtotal, IVA, envío y total. Plazos orientativos siempre identificados como tales.

## Contratos entre componentes
- Backend existente: `GET /products`, `GET /products/:slug`, `POST /carts`, `PUT /carts/:id/items`, `GET /carts/:id`, `POST /checkout`.
- Propuesta cotización: `POST /merch/quote-requests` en PR #25, **desactivada por defecto**. Necesita antiabuso y RGPD antes de activarse.
- Contrato de lote: PR #41. No está conectado al backend real.
- Aún NO existen endpoints listos para subir artes, aprobar proofs, estados de producción, área cliente ni perfil admin.
- La identidad visual debe integrarse en el frontend actual solo después de localizar qué proyecto despliega bassse.com.

## Criterios de aceptación visual/UX
1. Todos los caminos terminan en una acción coherente (presupuesto o pago confirmado), sin enlaces falsos.
2. Importe de lote reproducible y coherente con el servidor; no se cobra precio orientativo.
3. Estados de error de archivo, técnica, dirección, pago y aprobación con lenguaje claro en español.
4. Móvil real y test de teclado completo.
5. Sin inventar fotografías, condiciones comerciales ni datos del proveedor.
6. Revisar la fidelidad de logo y variantes antes de generar cualquier assets público.

**Bloqueo:** no publicar un frontend de compra ni activar pagos hasta verificación de hosting/contrato comercial/seguridad.
