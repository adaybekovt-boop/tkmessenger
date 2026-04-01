import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tkmessenger/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: { main: './index.html' }
    }
  },
  worker: { format: 'es' },
  server: { port: 5173 }
});