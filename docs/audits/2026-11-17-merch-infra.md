# BASSSE MERCH — auditoría inicial de infraestructura y repositorio (17-11-2026)

**Estado:** auditoría documental y consultas de API realizadas. No es una certificación de despliegue ni un pentest. **Issue:** #30.

## Evidencia comprobada
- Repositorio: `BassseAgency/bassseagency`, rama `main` protegida; la cuenta conectada dispone de admin/push.
- No hay storefront visible en el árbol de código: backend `src/app.ts`, `src/server.ts`, módulos de catálogo, inventario, carrito, pedidos, notificaciones, pagos, migraciones, workers y pruebas.
- `package.json`: Node 22+, TypeScript, Fastify, PostgreSQL (`pg`), `stripe@23.0.0`, Zod, Vitest. Existe `neon.ts` para integración Neon, pero no confirma BD productiva.
- `vercel.json` programa un cron para el worker; `src/index.ts` importa el servidor. Esto **no demuestra** que bassse.com apunte al deployment del repositorio.
- CI disponible en `.github/workflows/ci.yml` con Postgres 16, lint, typecheck, test, build y secret scanning.
- El backend tiene una ruta de catálogo, carrito, checkout, webhook firmado, operaciones de reserva, deduplicación de eventos, outbox y pruebas de integración. `PROJECT_STATE.md` indica que faltan servicios de producción y operaciones.
- `email.ts` utiliza `LogEmailSender` que **solo registra logs y no envía correos**.
- La API de carritos comprobaba la existencia de la variante sin comprobar que el producto estuviera activo. Corregido en borrador PR #23, CI verde. No está en main.
- El catálogo consta de 21 familias, 61 variantes con importes por lote; PR #27, borrador/quote_only y CI verde. No hay venta habilitada.
- El receptor de presupuestos está en PR #25 con `MERCH_QUOTES_ENABLED` por defecto desactivado; CI verde.
- PR #29 prepara la notificación interna del pedido pagado mediante outbox, pero no implementa proveedor SMTP/API real.
- El sitio https://www.bassse.com/ responde en búsqueda pública pero no ha permitido recuperar estructura técnica que confirme runtime, DNS ni repo fuente.
- La conexión a Vercel consultada para el equipo accesible no ha devuelto proyectos ni dominios. Es una **limitación de lo accesible**, no una prueba de que BASSSE no tenga proyecto desplegado en otro equipo o proveedor.
- La conexión Supabase accesible mostraba otros proyectos, pero el backend Merch se ha diseñado para PostgreSQL con configuración Neon; **no migrar a Supabase** sin razón técnica.

## Hallazgos importantes
1. **P0 alta:** verificar cuál es la web en producción y quién gestiona DNS/hosting; la API puede ser otro proyecto distinto del frontend.
2. **P0 alta:** no activar Checkout para manufactura bajo pedido hasta definir precio final de lote, IVA aplicable, portes y capacidad, y diferenciar pedido de stock físico.
3. **P0 alta:** controlar variantes inactivas en carrito/checkout (PR #23), la aprobación de arte y la identificación del cliente.
4. **P1 alta:** cotización, prueba de diseño, panel con autenticación, RGPD, proveedor de email real, alertas y conciliación.
5. **P1 media:** identificar por qué `README.md` afirma fase 0 mientras `PROJECT_STATE.md` documenta fase 2 y reconciliar.
6. **P1 media:** verificar el estado de GitHub Actions después de integrar todos los cambios, no solo en PR separadas.

## Dependencias y puertas
- Fase 1 requiere identificar frontend y reglas de producción/IVA/portes.
- Fase 2 requiere contratos aprobados y almacenamiento privado.
- Fase 3 requiere proveedor de email y prueba con Stripe TEST.
- Fase 4 requiere pruebas adversariales y legales.
- Fase 5 requiere despliegue de staging, restore y aprobación humana para pagos LIVE.

## No ejecutado
- No se pudo clonar este GitHub desde el contenedor por falta de resolución DNS; se utilizaron herramientas autenticadas de GitHub.
- No se hicieron pruebas locales de backend contra Postgres, salvo la CI de GitHub de las PR donde está explícitamente verde.
- No se verificaron dominio DNS/infraestructura live ni se activó Stripe, email o hosting.
- No se ha modificado ni desplegado la rama principal.
