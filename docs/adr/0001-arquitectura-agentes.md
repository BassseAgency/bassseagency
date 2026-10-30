# JOINT ARCHITECTURE DECISION

Participantes: Claude Code (Equipo A) y Codex (Equipo B).
Estado: **BORRADOR PARA REVISIÓN DEL USUARIO. No se ha modificado ningún repositorio.**
Rondas: 1 Claude (propuesta) → 2 Codex (crítica) → 3 Claude (respuesta, en las decisiones de abajo) → 4 Codex (propuesta alternativa) → 6 convergencia.

---

## 1. FINAL ARCHITECTURE

**Modular monolith en TypeScript**, empaquetado en una imagen Docker, desplegado junto con **PostgreSQL** en un proveedor de contenedores con procesos de larga duración (web + worker).

- Un repositorio, una base de datos, un artefacto desplegable.
- Los agentes **no** forman parte del runtime de producción. Son trabajadores de desarrollo.
- Git guarda código, tests, documentación estable y decisiones (ADR). GitHub gestiona el estado del trabajo.

Principio: la solución más simple que cumple los requisitos.

## 2. COMPONENTS

| Componente | Responsabilidad | Por qué existe |
|---|---|---|
| Repo Git (GitHub) | Código, docs, ADR, CI | Ya es compartido por ambos equipos |
| GitHub Issues + Project | Estado de tareas, asignación, dependencias | Un único registro mutable, visible desde cualquier equipo |
| PR borrador | Canal de handoff y registro técnico | Ya contiene diff, CI y revisión |
| GitHub Actions | Lint, typecheck, tests, build, secretos, auditoría | Gratis en repo público y 2.000 min/mes en privado |
| App (módulos internos) | `catalog`, `inventory`, `cart`, `orders`, `payments`, `customers`, `notifications`, `admin` | Límites explícitos; ningún módulo lee tablas ajenas |
| PostgreSQL | Datos de negocio + cola de jobs + idempotencia | Un solo dominio de datos, transaccional |
| Worker (mismo artefacto) | Ejecuta jobs (emails, webhooks diferidos, reservas expiradas) | Sin infra adicional |
| Proveedor de contenedores | Web + worker + Postgres gestionado | Vercel serverless no aloja workers persistentes (ver §19) |
| Stripe Checkout | Cobro | Nunca se toca tarjeta |
| Proveedor de identidad | Login de cliente y admin | No implementamos contraseñas propias |
| Sentry + logs JSON | Errores y trazabilidad | Free tier suficiente |

**No se introducen:** Redis, Kafka, Kubernetes, microservicios, locks distribuidos, ficheros de estado mutable en Git, daemon orquestador.

## 3. AGENTS

Dos agentes: **Claude Code** y **Codex**.

- Uno **implementa** la tarea; el otro **revisa, prueba y cuestiona** (incluida seguridad). Los roles se intercambian por issue.
- La planificación es un rol temporal de quien tenga la sesión, no un tercer agente.
- QA y seguridad son **checklists** dentro de la revisión, no agentes separados.
- Frontend/backend/e-commerce son **áreas de conocimiento**, no agentes.

Justificación: el mínimo que conserva revisión independiente sin pagar coordinación ociosa.

## 4. SKILLS

Empezar con **pocas**, y extraer más solo cuando un procedimiento se repita:

1. `AGENTS.md` (reglas de trabajo, comandos, límites) — es la skill principal.
2. Plantilla de issue y de PR (criterios de aceptación, tests, riesgo, rollback).
3. Cuatro comandos documentados: instalar, test, migrar, build.
4. `release` y `rollback` (procedimiento de despliegue; se formalizan al hacer el primer deploy).

Skills tipo `create-page`, `create-api-route`, etc. se crean **después** de repetir el mismo procedimiento tres veces. Ver desacuerdos §16.

## 5. HARNESS

**No hay harness propio en la fase inicial.** El "harness" es:

- GitHub Actions como ejecutor y registro (logs, artefactos, checks).
- Issues/PR como lifecycle de tarea.
- `AGENTS.md` como contrato único para ambos agentes.
- Límites de herramientas: cada agente trabaja con su propio token/sesión, con permisos mínimos sobre un único repo.
- Timeouts en cualquier comando externo que se escriba en la app o en scripts.

Un harness en código solo se justifica cuando haya un problema que los anteriores no resuelvan (decisión registrada en ADR).

## 6. STATE

| Estado | Dónde vive | Fuente de verdad |
|---|---|---|
| Tareas (backlog → ready → in progress → review → done/blocked) | GitHub Issues + Project | GitHub |
| Trabajo en curso | Rama `task/<id>-<slug>` + PR borrador | Git |
| Decisiones | `docs/adr/NNNN-*.md` | Git |
| Documentación de estado | `PROJECT_STATE.md` **actualizado al cerrar cada milestone** (no por tarea) | Git |
| Datos de negocio | PostgreSQL | Base de datos |
| Logs de ejecución | GitHub Actions + Sentry | Plataforma (retención definida) |

**No hay** `.agent-system/` con tareas, locks ni logs versionados. Se descarta por las razones de la crítica 2 y 3 de Codex: split-brain entre ramas y logs que se pierden.

Si ambos agentes necesitan contexto de sesión, se usa `PROJECT_STATE.md` y comentarios en el issue. Esa es la única "memoria" compartida.

## 7. GIT STRATEGY

- `main` siempre desplegable. Protegida: PR obligatorio, CI verde, sin push directo, sin force push.
- Rama corta por tarea: `task/<issue-id>-<slug>`. **Nunca** ramas permanentes por agente.
- Un issue → una rama → una PR. Commits pequeños con prefijo convencional (`feat:`, `fix:`, `test:`, `security:`…).
- PR borrador abierta **al empezar** con `Closes #id`. Es el mecanismo de handoff: si un agente cae, el otro lee la PR.
- Máximo **2 PR activas** por agente.
- Conflictos: rebase sobre `main` y CI completo de nuevo.
- Squash merge al integrar.
- Un agente **nunca** aprueba o mergea su propia PR. Merge: humano en el primer periodo; después, el revisor puede mergear si CI verde y no se toca un área crítica (§10).

Repo privado: GitHub Team recomendable (CODEOWNERS y reglas más fuertes). Si el repo es público, Free basta, pero entonces no hay secretos en el repo.

## 8. LOCKING

**Sin locks.** La exclusión se consigue con:

1. Asignación explícita: un issue tiene **un** responsable (`assignee` = `claude` o `codex`).
2. WIP limitado: una tarea activa por agente como norma.
3. PR borrador como señal de "en curso".
4. Antes de empezar: el agente comprueba issue, PR existentes y `main` (**sync antes de actuar**).

Los leases en Git se descartan: un rechazo non-fast-forward no es un lock, y el TTL con reloj distribuido es frágil. Si algún día hace falta exclusión automática, se hará con un único workflow coordinador, no con un protocolo inventado sobre commits.

## 9. IDEMPOTENCY

Estrategia por operación:

| Operación | Mecanismo |
|---|---|
| `POST /orders` y creación de checkout | Cabecera `Idempotency-Key`; tabla `(actor, route, key)` UNIQUE con hash del payload y respuesta almacenada. Misma clave + payload distinto → 409. La misma clave se reenvía a Stripe. |
| Webhooks Stripe | Verificación de firma; tabla `processed_events(provider, event_id)` UNIQUE, insertada **en la misma transacción** que aplica el efecto. Responder 2xx solo tras commit. |
| Orden de eventos | Transiciones de estado monotónicas (`pending_payment → paid → refunded/disputed`); un evento antiguo no retrocede estado. Optimistic locking con `version`. |
| Stock | Reserva con expiración: `UPDATE … WHERE available >= n` en una transacción sobre todos los artículos del pedido, orden estable de bloqueo. Confirmación al pagar; liberación por job al caducar. |
| Emails y efectos externos | Transactional outbox: el efecto se registra en la misma transacción; el worker lo envía con clave única `(template, entity_id)`. |
| Jobs | Clave única, `run_at`, máximo de intentos, backoff exponencial con jitter, timeout, dead-letter. Se confirma solo tras completar el efecto idempotente. |
| Migraciones | Versionadas, registradas, no reejecutables; advisory lock durante el deploy. |
| Deploy | `concurrency` en GitHub Actions: una sola ejecución de despliegue a la vez. |
| Creación de tareas/issues por agentes | Un agente busca antes de crear (título + etiqueta) para no duplicar. |

Reintentos: solo sobre operaciones con clave de idempotencia. Nunca "probablemente no se ejecutó" como criterio.

## 10. SECURITY

**Secretos**
- Nunca en Git. `.env.example` versionado; `.env*` ignorado.
- Secretos de producción en el proveedor de despliegue. Ningún secreto de producción en checks de PR.
- `gitleaks` en CI y pre-commit.

**CI y permisos**
- Actions con permisos `read` por defecto; acciones de terceros **fijadas por SHA**.
- `CODEOWNERS` y aprobación humana sobre `.github/workflows/`, `infra/`, migraciones, `auth/`, `payments/`.
- Los agentes no pueden modificar protecciones de CI ni de rama.
- PR de fork: sin secretos.

**Aplicación**
- Autenticación: proveedor de identidad (magic link para clientes; OIDC con MFA para admin). Sesiones opacas en Postgres, cookies `HttpOnly`, `Secure`, `SameSite=Lax`, rotación.
- Autorización **server-side por recurso** (un usuario solo ve sus pedidos). RBAC en tabla propia para admin.
- RLS de Postgres como segunda barrera; `service_role` / credenciales de DB solo en procesos de servidor.
- Validación de entrada con esquema (Zod) en cada borde externo; errores normalizados sin filtrar secretos.
- Rate limiting en login, checkout y endpoints públicos.
- Headers de seguridad y CSRF donde haya formularios con cookies.

**Principio:** los agentes tienen el mínimo: token fine-grained de un repo, sin acceso a producción, sin credenciales de Stripe live.

## 11. TESTING

Pirámide mínima, todo en CI:

- **Unit**: reglas de negocio (precios, impuestos, transiciones de estado, política de stock).
- **Integration** con Postgres real (service container): idempotencia, webhooks duplicados y desordenados, reservas concurrentes, migraciones en base vacía.
- **Contract**: firma y formato de webhooks Stripe con fixtures; tests con Stripe CLI en local.
- **E2E mínimo** (Playwright): registro/login → producto → carrito → checkout en modo test → pedido creado tras webhook.

**Bloquean merge:** lint, typecheck, unit, integration, build, gitleaks.
**No bloquean merge, pero se revisan:** `npm audit` (bloquea solo severidad alta/crítica en rutas en uso, con excepción temporal y caducidad), tests E2E extendidos.

## 12. CI/CD

**PR:** install con lockfile → lint → typecheck → unit → integration → build → gitleaks → audit.
**Merge a `main`:** una ejecución (con `concurrency`) → construir imagen con SHA → migrar (expand) → desplegar → comprobar `/health/ready` → si falla, restaurar imagen anterior.
**Entornos:** `development` (local + Docker Compose), `preview` (por PR, sin datos reales, Stripe test), `production` (aprobación de environment de GitHub).

Pipeline no mayor de un workflow de PR y uno de deploy.

## 13. OBSERVABILITY

- **Logs:** JSON a stdout con `request_id`, `order_id`, `job_id`, versión de release. Datos personales y secretos redactados.
- **Errores:** Sentry (free tier).
- **Health:** `/health/live` (proceso) y `/health/ready` (DB reachable). `/api/health` puede ser alias de `ready`.
- **Métricas de negocio (las que cuestan dinero):** pedidos en `pending_payment` > N minutos; webhooks fallidos; jobs en dead-letter; jobs envejecidos; divergencias pagos ↔ Stripe; fallo de deploy.
- **Conciliación diaria** de pedidos pagados contra Stripe (job programado).
- **Tracing distribuido:** no en fase inicial. Correlación por `request_id` es suficiente.

## 14. COST

**Gratis**
- GitHub Free (repo público) o Team (privado, recomendable).
- GitHub Actions: 2.000 min/mes en plan gratuito (suficiente para un proyecto pequeño).
- Sentry free tier.
- Stripe: sin cuota fija (solo comisiones por transacción).

**Obligatorio**
- Proveedor de contenedores con Postgres: estimación Codex **≈21–30 USD/mes** (plan de pago desde ~5 USD como MVP; ~20 USD/mes en uso comercial). **Verificar precios actuales antes de contratar.**
- Dominio: ≈10–15 €/año.
- Proveedor de identidad: gratis en tier pequeño (verificar límites).
- Email transaccional: plan gratuito al inicio (verificar límites).
- Comisiones Stripe por venta.

**Opcional**
- GitHub Team (~4 USD/usuario/mes) si el repo es privado y hace falta CODEOWNERS con aprobación obligatoria.
- Backups gestionados adicionales.
- Consumo de LLM (Claude/Codex): se controla con topes mensuales y tareas pequeñas en modelos baratos.

**Pendiente de verificación:** los precios y límites citados son orientativos. Antes de contratar cualquier servicio hay que comprobarlos en la página oficial.

## 15. FAILURE MODES

| Fallo | Mitigación |
|---|---|
| Claude cae a mitad de tarea | La rama y la PR borrador quedan. Codex (u otra sesión de Claude) retoma leyendo la PR y el issue. Nada se pierde porque el estado está en Git. |
| Codex cae a mitad de tarea | Igual que arriba. |
| Ambos tocan lo mismo | Un issue = un responsable. Si hay solape, el segundo detecta la PR abierta y se detiene. Conflictos → rebase. |
| Commit rompe `main` | Revert inmediato de la PR (squash facilita revert). `main` protegida impide merge con CI roto, así que es raro. |
| Agente en loop | Límite de intentos por tarea (p. ej. 3 ciclos test→fix). Al superarlo: issue a `blocked` con diagnóstico, y se para. |
| API externa falla (Stripe, email) | Timeout explícito; reintento solo con clave de idempotencia; circuit breaker simple en el cliente de Stripe; outbox para emails. |
| Migración fallida | Migraciones expand/contract; en fallo, el deploy se detiene antes de cambiar la app. Restauración desde backup solo con aprobación humana. |
| Rollback de app con esquema nuevo | Código nuevo compatible con esquema previo durante la ventana expand. No se usan `down` automáticas. |
| Webhook duplicado o desordenado | Deduplicación por `event_id` + transiciones monotónicas. |
| Pago cobrado sin pedido | Pedido creado antes del checkout (`pending_payment`); conciliación diaria detecta divergencias. |
| Pérdida de datos | Backups automáticos, restauración ensayada, RPO/RTO a fijar antes de producción. |
| Secreto filtrado | Rotación por humano; gitleaks en CI; permisos mínimos. Rotar siempre es acción humana. |
| Job atascado | Lease de ejecución con expiración; reintento con backoff; dead-letter visible. |

## 16. DISAGREEMENTS

1. **Estado de tareas en ficheros del repo vs. GitHub Issues.** Claude: `.agent-system/tasks/*.md`. Codex: Issues. → Codex.
2. **Locks con TTL sobre Git.** Claude: sí. Codex: no. → Codex.
3. **Harness en código (CLI con claim/release).** Claude: sí. Codex: no en fase inicial. → Codex.
4. **Cola de jobs.** Claude: pg-boss o cola propia sobre `SKIP LOCKED`. Codex: Graphile Worker o equivalente. Discrepancia menor. → **Graphile Worker o equivalente** con mismos contratos (idempotencia, dead-letter, timeout). Sin cola propia.
5. **Hosting: Vercel vs proveedor de contenedores.** Claude: Vercel (Next.js, serverless). Codex: contenedores con worker permanente. → **Contenedores con web+worker**, porque el worker de jobs no encaja en serverless. Vercel puede seguir usándose como frontend en fase posterior, pero se descarta el monolito dividido en dos plataformas hasta que haya razón.
6. **Autenticación.** Claude: Supabase Auth. Codex: magic link + sesiones propias en Postgres + OIDC para admin. → **Proveedor de identidad solo para identidad**, sesiones y autorización en el servidor. Se decide el proveedor concreto en un ADR.
7. **Número de agentes.** Claude: 3 (orchestrator, implementer, reviewer). Codex: 2 con roles intercambiables. → **Codex (2)**.
8. **Rollback con `down`.** Claude: sí. Codex: no, expand/contract. → **Codex**.
9. **Revisión humana.** Claude: humano para producción y algunas operaciones. Codex: humano solo en áreas críticas. → **Codex**, con la lista explícita de §10 y §18.
10. **Logs versionados.** Claude: JSONL en repo. Codex: no. → **Codex**.
11. **Alcance inicial.** Claude: el sistema completo de agentes. Codex: primero el flujo de compra completo. → **Codex**.

**Desacuerdo que queda abierto** (decisión del usuario):
- Si el repo es **privado** (requiere GitHub Team ~4 USD/usuario/mes para CODEOWNERS con aprobación obligatoria) o **público** (sin esa protección, sin secretos en repo). Recomendación: privado, aceptando el coste.

## 17. DECISIONS

- D1: Modular monolith TypeScript, un artefacto, Postgres.
- D2: Estado de tareas en GitHub Issues + Project. Sin `.agent-system/` mutable.
- D3: Sin locks. Asignación explícita + PR borrador + WIP 1 por agente.
- D4: Dos agentes (Claude Code, Codex) con roles intercambiables por issue.
- D5: Trunk-based: `main` protegida, ramas `task/<id>-<slug>`, squash merge.
- D6: Sin harness propio en fase inicial; `AGENTS.md` como contrato.
- D7: Cola de jobs en Postgres con Graphile Worker o equivalente; outbox para efectos externos.
- D8: Stripe Checkout alojado; pedido `pending_payment` antes de checkout; solo webhook firmado marca `paid`.
- D9: Migraciones expand/contract, forward-only; rollback = redeploy de SHA anterior.
- D10: Identidad externa; autorización en servidor; RLS como segunda barrera.
- D11: Hosting en contenedores (web + worker + Postgres gestionado). Precios a verificar.
- D12: Revisión humana obligatoria en pagos, auth, permisos, migraciones, workflows de CI y producción.
- D13: Reserva de stock con expiración y liberación por job.
- D14: Observabilidad por métricas de negocio además de técnicas.

## 18. IMPLEMENTATION ORDER

**Fase 0 — Preparación (sin código de producto)**
1. Decidir privado/público y crear el repo remoto.
2. Proteger `main` (PR obligatorio, CI requerido, sin force push).
3. Crear `AGENTS.md`, `README.md`, `docs/adr/0001-*` (este documento convertido en ADR), plantillas de issue y PR.
4. Configurar Issues + Project con estados y campos.
5. Secret scanning y gitleaks en CI; `.gitignore`, `.env.example`.

**Fase 1 — Esqueleto ejecutable**
6. Monorepo mínimo TypeScript, lint, typecheck, test, build; un "hello" con `/health/live` y `/health/ready`.
7. Postgres local con Docker Compose; migraciones con herramienta versionada; test de integración con Postgres real.
8. Workflow de PR completo y deploy a preview.

**Fase 2 — Recorrido vertical de compra (un solo flujo end-to-end)**
9. Catálogo mínimo (productos, variantes, precio en céntimos, moneda).
10. Carrito y reserva de stock con expiración.
11. Pedido `pending_payment` + `Idempotency-Key`.
12. Stripe Checkout en modo test + webhook firmado + deduplicación + transiciones monotónicas.
13. Outbox + worker + email de confirmación.
14. E2E de compra completo.

**Fase 3 — Operación**
15. Conciliación diaria con Stripe; alertas de métricas de negocio.
16. Backups y restauración ensayada; RPO/RTO documentados.
17. Runbooks: deploy, rollback, restauración, rotación de secretos, webhook caído.

**Fase 4 — Ampliación**
18. Auth de cliente completa (cuentas, reset), área admin con RBAC.
19. Devoluciones, reembolsos y disputas como estados explícitos.
20. Envíos e impuestos (requiere reglas de negocio validadas).
21. SEO técnico, accesibilidad WCAG 2.2 AA, rendimiento.

**Skills** se extraen al repetir un procedimiento tres veces, no antes.

## 19. FIRST SAFE STEP

**Acción sin riesgo:** redactar este documento como `docs/adr/0001-arquitectura-agentes.md` en un repo nuevo, **sin** código, y pedir al usuario que revise y decida los puntos abiertos (privado/público, proveedor de contenedores, proveedor de identidad).

Antes de tocar nada remoto: confirmar la cuenta y el nombre del repositorio con el usuario.

---

## Pendiente de verificación (no comprobado en esta sesión)

- Precios y límites de proveedores de contenedores, identidad, email y GitHub.
- Versión concreta de Graphile Worker / pg-boss y su mantenimiento actual.
- Los costes son estimaciones de las rondas; no se han consultado páginas de precios en esta sesión.
