import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests de integración comparten una única base: se ejecutan en serie.
    fileParallelism: false,
    // Worktrees de agentes viven en .claude/worktrees: no son parte de esta copia.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
});
