# Correo interno de pedidos pagados — propuesta

El handler interno sólo se encola tras confirmarse el pago por webhook firmado, con deduplicación vía outbox. Configurar `MERCH_ORDER_EMAIL` en servidor cuando el proveedor transaccional esté listo. Si no se configura, no se encola el aviso interno.

**Estado actual:** `LogEmailSender` es simulado: no envía correos reales. Para cumplir el requisito de llegada al correo de BASSSE hace falta añadir un adaptador de email real con autenticación, DKIM/SPF/DMARC, tratamiento de reintentos y pruebas de entrega. La confirmación de envío no debe sustituir el panel privado. No activar en producción antes de validar la entrega y configurar alertas.

No se incluyen datos de clientes en el asunto de la notificación. El enlace de acceso privado al pedido se incorporará cuando exista autorización administrativa.
