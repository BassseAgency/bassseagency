# Recepción de solicitudes de presupuesto: propuesta controlada

Ruta de API (solo al habilitar flag): `POST /merch/quote-requests`.
No dispara pagos, no calcula importes, no genera pedidos. Guarda datos básicos para revisión por BASSSE. **Se mantiene desactivada por defecto.**

## Requisitos pendientes antes de habilitar incluso en producción
- Rate limiting / challenge anti-spam / protección frente a bots.
- Política de privacidad, finalidad, conservación y borrado RGPD.
- Autenticación/RBAC del backoffice para lectura del pedido.
- Proveedor de email transaccional validado, alertas de fallo y monitorización.
- Formulario visible y comprobación E2E.
- Comprobación de capacidad del proveedor y precios.
- Revisión de migración por humano.

Las imágenes, artes o logos no se reciben por esta ruta: necesitan un flujo seguro separado (almacenamiento privado, análisis MIME, tamaño, malware, ACL y expiración de URLs).
