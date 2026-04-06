import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.svg', 'pwa-512x512.svg', '404.html', '.nojekyll'],
      manifest: {
        name: 'Orbits P2P',
        short_name: 'Orbits',
        description: 'Высокопроизводительный P2P-мессенджер — Phase 1: Криптографическое ядро',
        theme_color: '#05050A',
        background_color: '#05050A',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,webp,jpg,jpeg,wasm}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
    })
  ],
  // Поддержка загрузки WebAssembly
  optimizeDeps: {
    exclude: ['orbits-crypto']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: { main: './index.html' },
      output: {
        manualChunks: {},
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: 'esbuild',
    target: 'esnext'
  },
  esbuild: {},
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        // Wasm файлы должны быть доступны воркерам
        inlineDynamicImports: true
      }
    }
  },
  server: {
    port: 5173,
    headers: {
      // Заголовки для корректной работы SharedArrayBuffer и Wasm
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
}));
