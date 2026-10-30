import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests de integración comparten una única base: se ejecutan en serie.
    fileParallelism: false,
  },
});
