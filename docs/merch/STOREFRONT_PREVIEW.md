# BASSSE MERCH — Vista previa de catálogo sin cobros

**Requisito comercial acordado, 17/11/2026**: Vercel, avisos de pedidos a `info@bassse.com`, compra directa únicamente para tarifas aprobadas y presupuestos para el resto.

## Alcance de PR #34
Landing `GET /merch` de 21 familias, con estética negro/blanco/naranja, responsive y CSS inline. No sustituye el logotipo maestro oficial: antes de publicación pública, incorporar exclusivamente los archivos autorizados de BASSSE. No incluye precios, carrito, Stripe, subida de logos ni recepción automática de pedidos.

Permanece **inactiva por defecto**. Activación exclusiva para pruebas en un proyecto Vercel de preview mediante variable de entorno de servidor:
```
MERCH_STOREFRONT_PREVIEW_ENABLED=true
```
No habilitar esa variable en producción ni apuntar el DNS a un entorno de prueba. La ruta utiliza `noindex,nofollow` y `Cache-Control: no-store`; este noindex no sustituye autenticación si la preview contiene información privada (esta no la contiene).

Las solicitudes usan `mailto:info@bassse.com` como alternativa manual, **no** un servicio de confirmación automática. No se almacenan datos ni se afirma que se haya enviado correo.

## Riesgos y dependencias
- Falta identificar proyecto Vercel propietario de bassse.com. La conexión actual al equipo `BASSSE's projects` no devuelve proyectos ni dominios; `get_domain(bassse.com)` respondió 403. No hay autorización ni evidencia para conectar el dominio o desplegar.
- Requiere incorporar identidad gráfica real bajo el sistema visual aprobado, sin reconstruir el logo a partir de texto.
- PR #27 contiene catálogo en borrador, esta landing representa los nombres pero no usa precios.
- PR #41 contiene contrato de importes de lote, que aún no se integra en Checkout.
- PR #25 contiene endpoint de presupuesto desactivado por defecto y pendiente de antiabuso/RGPD.
- Futuras fases: integrar rutas de producto y navegación, formularios, almacenamiento privado, Stripe test, impuesto/portes verificados, aprobación de arte, panel y envíos. No habilitar compra directa hasta entonces.
- Antes de integrar la interfaz en producción: ejecutar lint, typecheck, test, build y revisar accesibilidad y branding.

## Prueba local
```
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```
Desplegar en Vercel preview únicamente después de vincular el proyecto correcto y habilitar la variable solo en Preview.
