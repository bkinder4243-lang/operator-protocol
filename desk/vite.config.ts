import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/operator-protocol/desk/
export default defineConfig({
  base: '/operator-protocol/desk/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
