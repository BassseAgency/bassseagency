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
5. Un agente **nunca** aprueba ni mergea su propia PR.

## Reglas no negociables
- Nunca secretos en Git. `.env*` ignorado; solo `.env.example`.
- Nunca push directo a `main`, ni force push.
- Nunca tocar credenciales, Stripe live ni producción sin autorización humana explícita.
- Pagos, auth, permisos, migraciones, `.github/workflows/` y deploy requieren revisión humana.
- Migraciones solo forward-only (expand/contract). Nada de `down` automáticas.
- Toda llamada externa lleva timeout explícito.
- Operaciones repetibles deben ser idempotentes (ver ADR 0001, §9).
- No inventar precios, límites ni versiones: verificarlos en la fuente oficial.

## Comandos (se completan en Fase 1)
- Instalar: _pendiente_
- Test: _pendiente_
- Migrar: _pendiente_
- Build: _pendiente_

## Estado
- Estado de tareas: GitHub Issues + Project (no hay ficheros de tareas en el repo).
- Decisiones: `docs/adr/`.
- Estado de milestone: `PROJECT_STATE.md` (se crea en Fase 1).
