import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    // Let the dev server be reached through a Cloudflare tunnel (npm run tunnel).
    allowedHosts: ['.trycloudflare.com', '.gero.sh'],
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
