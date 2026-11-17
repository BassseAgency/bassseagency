# Correo interno de pedidos pagados — propuesta

El handler interno sólo se encola tras confirmarse el pago por webhook firmado, con deduplicación vía outbox. Configurar `MERCH_ORDER_EMAIL` en servidor cuando el proveedor transaccional esté listo. Si no se configura, no se encola el aviso interno.

**Estado actual:** `LogEmailSender` es simulado: no envía correos reales. Para cumplir el requisito de llegada al correo de BASSSE hace falta añadir un adaptador de email real con autenticación, DKIM/SPF/DMARC, tratamiento de reintentos y pruebas de entrega. La confirmación de envío no debe sustituir el panel privado. No activar en producción antes de validar la entrega y configurar alertas.

No se incluyen datos de clientes en el asunto de la notificación. El enlace de acceso privado al pedido se incorporará cuando exista autorización administrativa.

## Adaptador Resend (opcional)
- Crear/verificar un dominio remitente autorizado en Resend y configurar DNS SPF/DKIM/DMARC antes de enviar correos comerciales.
- Configurar en **servidor** `RESEND_API_KEY` y `RESEND_FROM_EMAIL`; ambos son obligatorios para seleccionar el adaptador real. Si faltan, se conserva el sender de logs. No subirlos a Git.
- Configurar `MERCH_ORDER_EMAIL=info@bassse.com` para el aviso interno solo si corresponde al buzón operativo.
- Verificar entregas en staging, rebotes, eventos y alertas antes de habilitar en producción.
- El adaptador usa `POST https://api.resend.com/emails`, `Idempotency-Key` y timeout de 4 segundos. Según Resend, su cache de idempotencia dura 24 horas, así que los reintentos posteriores requieren controles operativos adicionales.
- Documentación oficial: https://resend.com/changelog/idempotency-keys y https://resend.com/docs/api-reference/emails/send-email
- Ningún email ha sido enviado en esta PR; las pruebas utilizan un fetch simulado.
