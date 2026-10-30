import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { cartModule } from './cart/index.js';
import { catalogModule } from './catalog/index.js';

/** Dependencias que cada módulo recibe. Se amplía (Stripe, email…) cuando un módulo lo necesite. */
export interface ModuleDeps {
  db: Pool;
}

export type AppModule = (app: FastifyInstance, deps: ModuleDeps) => void;

/**
 * Registro de módulos. Cada módulo vive en src/modules/<nombre>/ y exporta un AppModule.
 * Añadir un módulo = una línea aquí. Escrituras sobre datos de otro módulo solo por puertos
 * (ports.ts); lecturas de catálogo e inventario permitidas (ADR 0002 §1).
 * El módulo de pedidos necesita un proveedor de pagos y se registra en app.ts.
 */
export const modules: AppModule[] = [catalogModule, cartModule];
