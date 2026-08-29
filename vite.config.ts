import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
