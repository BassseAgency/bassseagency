# BASSSE MERCH — Contratos de aceptación para fases 0–5

**Fuente comercial:** `BASSSE Merch · Catálogo.pdf`, edición 2026. Las tablas son por lote y técnica indicada, algunas orientativas; cotizaciones de octubre 2026. Antes del cobro hay que validar precio, transporte, fiscalidad, técnica y plazo.

### Fase 0 — Auditoría (paralelo A/B)
- A: `main`, rutas API, test y CI, repositorio/hosting vinculado al dominio, dependencias y secretos sin exponer.
- B: matriz producto → cantidad mínima → técnica → tarifa cerrada/orientativa/presupuesto → precio lote con y sin IVA → fuente página.
- **Gate:** inventario técnico y matriz con discrepancias documentadas; ningún artículo se activa por defecto.

### Fase 1 — Contrato de producto y UX (paralelo A/B)
- A: ADR que decide si catálogo de fabricación bajo pedido exige reserva física o un nuevo flujo de capacidad de producción.
- B: configurador, upload de logo, condiciones de envío, precio final, presupuesto personalizado y consentimiento.
- **Gate:** contratos frontend/API, modelo dinero en céntimos, control de variantes y trazabilidad de decisiones.

### Fase 2 — Implementación aislada
- A: configurador, presupuesto, archivos privados, versiones y aprobación del arte.
- B: frontend responsive de tienda /merch, carrito y pedido conectado al backend existente.
- **Gate:** pruebas funcionales y de acceso a ficheros; sin rutas públicas inseguras.

### Fase 3 — Pagos y operaciones
- A: Stripe Checkout **test**, webhook, reconciliación, importes/tasas y pago diferido.
- B: outbox con proveedor transaccional real, notificación interna y cliente, panel de producción y envío.
- **Gate:** confirmación solo por webhook firmado y con importe conciliado; emails realmente enviados en entorno de test.

### Fase 4 — Calidad
- A: autenticación/autorización, privacidad, fraude, fiabilidad y recuperación.
- B: carga, accesibilidad, SEO, logs, monitorización, backups y runbooks.
- **Gate:** lint + typecheck + tests unitarios/integración/E2E + auditoría + restauración de prueba.

### Fase 5 — Lanzamiento
- Staging idéntico a producción en configuración relevante; test de compra, cancelación, duplicados y reembolso en Stripe TEST.
- Validación humana de precios, IVA por destino, envíos, textos comerciales, política de pedidos personalizados y soporte.
- **Gate:** aprobación humana explícita antes de habilitar Stripe LIVE y desplegar. Nada de cobros reales o merges automáticos.
