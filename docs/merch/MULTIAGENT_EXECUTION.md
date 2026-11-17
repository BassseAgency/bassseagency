# BASSSE MERCH — Protocolo de trabajo por especialidad

Issue de coordinación: #20. Reglas superiores: `AGENTS.md`, `docs/adr/0001-arquitectura-agentes.md`, `docs/adr/0002-decisiones-fase-2.md`.

## Estado verificado del repositorio
La rama `main` contiene TypeScript, Fastify, PostgreSQL, migraciones, API de productos, carrito, checkout Stripe y webhook firmado, outbox con sender de desarrollo y pruebas. **No afirmar producción lista.** Actualmente el proveedor real de correo, la integración en bassse.com y la puesta en marcha comercial no están acreditados. `PROJECT_STATE.md` reconoce trabajo pendiente; `README.md` tiene estado desactualizado y debe reconciliarse en un issue distinto.

## Secuencia con paralelismo

| Etapa | Carril A | Carril B | Barrera para avanzar |
|---|---|---|---|
| 0 | Auditar repo, rutas y CI | Extraer y comprobar precios/categorías del PDF | Evidencias, precios bloqueados |
| 1 | ADR de integración / infraestructura | UX / flujos de pedido personalizado | Contratos aprobados |
| 2 | API para configuraciones, artes, presupuestos | Frontend tienda conectado a contratos | Contract tests, accesibilidad |
| 3 | Integración Stripe TEST / tax / transporte | Emails, aprobación y producción | E2E con webhook real de test |
| 4 | QA seguridad y regresión | Observabilidad, backups y runbooks | CI, conciliación y restore |
| 5 | Staging + revisión humana | SEO, textos y legales validados | Aprobación explícita de lanzamiento |

Los carriles son propuestas; no ejecutar tareas de etapas posteriores mientras haya dependencias pendientes.

## Roles / ownership
Cada issue define `owner_paths`, responsable técnico, revisor, dependencias, criterios de aceptación y rollback. Se prohíbe que dos agentes editen el mismo módulo a la vez. Una sesión Codex no reemplaza una aprobación humana, especialmente en pagos, auth, migraciones, CI y despliegue.

## Workflow de CLI, local en Windows 11
1. Instalar Git, Node.js, Codex CLI y opcionalmente Claude Code. Autenticar GitHub y verificar `gh repo view BassseAgency/bassseagency --json viewerPermission`.
2. Clonar `https://github.com/BassseAgency/bassseagency.git`; ejecutar `git fetch`, `npm ci` y leer `AGENTS.md` y ADRs.
3. Crear issue propio, rama `task/<issue>-<slug>` desde `main`, PR borrador y worktree separado.
4. Ejecutar un agente por worktree, con límites y permisos de la CLI; capturar resultados verificables y commits.
5. Ejecutar el revisor en sesión limpia de solo lectura. Crear/actualizar pruebas. **No merge automático**.
6. Revisar CI y aprobaciones y solicitar merge humano.

## Inicio fase 0
- Auditoría: comprobar despliegue y DNS de bassse.com, dependencias, estado de CI y brechas frente a catálogo.
- Catálogo: cotejar las 20 páginas y distinguir las tarifas cerradas, orientativas y bajo presupuesto; usar totales originales y no el unitario redondeado para construir los importes.

## Normativa y seguridad
Nunca subir logos de clientes a repositorios públicos. Archivo original en bucket privado, rutas temporales firmadas, límite de tamaño/tipo, protección frente a contenido activo y registro de versiones; aprobación del arte registrada por pedido. No activar productos de precio no verificado ni emitir cargos por importes sin portes/impuestos validados.

## Indicador de avance
Una tarea **no está completada** por existir un prompt, informe o PR: necesita evidencia de aceptación, tests y merge cuando corresponda.
