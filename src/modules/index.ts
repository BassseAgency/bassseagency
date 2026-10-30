import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

/** Dependencias que cada módulo recibe. Se amplía (Stripe, email…) cuando un módulo lo necesite. */
export interface ModuleDeps {
  db: Pool;
}

export type AppModule = (app: FastifyInstance, deps: ModuleDeps) => void;

/**
 * Registro de módulos. Cada módulo vive en src/modules/<nombre>/ y exporta un AppModule.
 * Añadir un módulo = una línea aquí. Ningún módulo lee tablas que pertenecen a otro.
 */
export const modules: AppModule[] = [];
