# AGENTS.md — Reglas de trabajo para agentes

Lee primero `docs/adr/0001-arquitectura-agentes.md`. Es la decisión de arquitectura vigente.

## Roles
- Dos agentes: **Claude Code** e **Codex**. Uno implementa; el otro revisa, prueba y cuestiona (incluida seguridad). Los roles se intercambian por issue.

## Antes de actuar
1. `git fetch` y comprueba `main` y las PR abiertas.
2. Comprueba que el issue no tiene PR activa ni responsable distinto.
3. Si hay trabajo ajeno en la misma área, para y avisa en el issue.

## Flujo
1. Trabaja en `task/<issue-id>-<slug>` desde `main` actualizado.
2. Abre PR borrador enseguida con `Closes #<id>`.
3. Commits pequeños, prefijo convencional: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `security:`.
4. Antes de pedir revisión: lint, typecheck, tests y build en local.
5. Merge solo con CI verde y la checklist de la plantilla de PR completa.
   - Restricción actual: Claude y Codex comparten la cuenta `BassseAgency`, así que no hay aprobación de segunda persona. La revisión independiente la hace el otro agente en un comentario de PR, y el merge solo se hace con CI verde.
   - Áreas sensibles (pagos, auth, permisos, migraciones, CI, deploy) necesitan confirmación humana antes del merge.

## Reglas no negociables
- Nunca secretos en Git. `.env*` ignorado; solo `.env.example`.
- Nunca push directo a `main`, ni force push.
- Nunca tocar credenciales, Stripe live ni producción sin autorización humana explícita.
- Pagos, auth, permisos, migraciones, `.github/workflows/` y deploy requieren revisión humana.
- Migraciones solo forward-only (expand/contract). Nada de `down` automáticas.
- Toda llamada externa lleva timeout explícito.
- Operaciones repetibles deben ser idempotentes (ver ADR 0001, §9).
- No inventar precios, límites ni versiones: verificarlos en la fuente oficial.
- Dependencias nuevas: versión exacta publicada hace al menos 14 días (ADR 0002 §5).

## Comandos
- Instalar: `npm ci`
- Postgres local: `docker compose up -d db` (crear `bassseagency_test` la primera vez)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `TEST_DATABASE_URL=postgres://app:app@localhost:5432/bassseagency_test npm test`
- Build: `npm run build`
- Arrancar API: `DATABASE_URL=postgres://app:app@localhost:5432/bassseagency MIGRATE_ON_START=true npm run dev`
  (sin `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` arranca sin checkout)
- Arrancar worker: `npm run build && DATABASE_URL=... npm run worker`
- Migrar: `MIGRATE_ON_START=true` al arrancar la API (advisory lock: seguro con varias instancias).

Los tests de integración usan `TEST_DATABASE_URL`, nunca `DATABASE_URL`, porque borran el esquema `public`.

## Estado
- Estado de tareas: GitHub Issues + Project (no hay ficheros de tareas en el repo).
- Decisiones: `docs/adr/`.
- Estado de milestone: `PROJECT_STATE.md` (se crea en Fase 1).
