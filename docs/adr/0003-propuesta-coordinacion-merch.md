# ADR 0003 — Propuesta: especialidades multiagente para BASSSE MERCH

**Estado: PROPUESTA — requiere revisión; no sustituye ADR 0001 ni 0002.**
**Issue:** #20. **Fecha:** 2026-11-17.

## Contexto
El backend actual ya ofrece catálogo, carrito, checkout, reservas, Stripe y outbox en Fastify/PostgreSQL. Falta comprobar integración con la web publicada, configurar personalización por lote, archivos privados, visto bueno del arte, operaciones, email real, fiscalidad y logística. El catálogo BASSSE Merch 2026 es material de referencia, **no tarifa automáticamente aprobada**.

## Decisión propuesta
Respetar los dos ejecutores máximos definidos en ADR 0001. Los once perfiles son **especialidades de tareas**, no once procesos autónomos escribiendo simultáneamente:
- Dirección técnica / integración
- Auditoría de repositorio e infraestructura
- Catálogo, tarifas y márgenes
- UX / recorridos B2B
- Frontend y accesibilidad
- Backend y PostgreSQL
- Stripe y conciliación
- Artes, subida privada, prueba y aprobación
- Pedidos, producción, emails y logística
- QA y seguridad
- DevOps y observabilidad

**Routing temporal:** Codex implementa; una segunda sesión aislada de Codex revisa mientras Claude no esté disponible. Ese contraste no equivale a revisión independiente entre modelos, por lo que se exige revisión humana antes del merge. Cuando Claude esté disponible puede revisar de forma cruzada. Un mismo ejecutor no aprueba su propia PR.

## Ejecución
- Trabajo real en GitHub Issues y PR; un issue por tarea y una rama corta `task/<issue>-<slug>`.
- Máximo dos implementaciones simultáneas, sin rutas de escritura superpuestas.
- Comprobar estado de `main`, PR abiertas, propietarios y dependencias antes de empezar.
- Un repositorio; preservar TypeScript/Fastify/Postgres. No incorporar Supabase ni rehacer la web sin ADR y prueba.
- Cada trabajo aporta evidencia, criterios de aceptación, comandos/test usados, riesgos y revisión.
- El orquestador CLI externo propuesto es **opcional y local**; no añadirlo al runtime de e-commerce ni mantener estados mutables en Git.

## Gates de aceptación
1. Discovery: auditar código, despliegue y frontend verdadero.
2. Dependency: tareas bloqueadas hasta merge/revisión de predecesoras.
3. Isolation: ramas/worktrees y permisos mínimos.
4. Pricing: importes de **lote** guardados en céntimos; precios orientativos bloqueados; IVA y portes verificados.
5. Payments: Stripe TEST, firma webhook, idempotencia, eventos duplicados/desordenados, devoluciones y conciliación.
6. Artwork: almacenamiento privado, controles de archivo, versiones, aceptación explícita del cliente.
7. Fulfillment: pago y estado de producción separados, notificación fiable, control de proveedor y envío.
8. QA: lint, typecheck, tests Postgres, E2E y controles de seguridad; revisor distinto.
9. Release: revisión humana, staging, backup/restore, rollback, políticas legales y de transporte.

## Prohibiciones
Sin secretos ni tokens en Git; sin `main` directo, force-push, auto-merge, Stripe live, cobros, deploy ni migraciones contra producción sin autorización explícita. Las áreas sensibles del AGENTS.md conservan sus aprobaciones humanas.

## Resoluciones pendientes
Hosting efectivo de bassse.com, stack/frontend real, modelo de stock para fabricación por encargo, validez de precios y costes, IVA por destino, portes, proveedor email, proveedor de identidad y soporte logístico.

## Criterio para aceptar este ADR
Revisión técnica y humana de #20, CI verde y merge de PR con cambios documentales; después convertir fases en issues propios antes de escribir código de tienda.
