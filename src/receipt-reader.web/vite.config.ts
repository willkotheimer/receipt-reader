import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The built bundle is served from the API's wwwroot in PR8, so there is a single origin
// and no CORS surface. In development the proxy below reproduces that arrangement.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    // worker_threads rather than the default forked child processes. On this Windows
    // machine the forks pool times out waiting for workers to start; threads spawn
    // in-process and are unaffected.
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**'],
    },
  },
});
