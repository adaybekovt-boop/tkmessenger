import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Inject a strict Content-Security-Policy meta tag into the production build
// only. In dev Vite relies on inline HMR scripts, so we leave CSP to the dev
// server headers (which already carry a permissive policy for HMR).
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' wss: ws: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const prodCspPlugin = {
  name: 'orbits-prod-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${PROD_CSP}">`;
      return html.replace('<head>', `<head>\n    ${tag}`);
    },
  },
};

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __ORBITS_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    react(),
    prodCspPlugin,
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.json',
      includeAssets: ['pwa-192x192.svg', 'pwa-512x512.svg', '404.html', '.nojekyll'],
      manifest: {
        name: 'Orbits Titan',
        short_name: 'Orbits',
        description: 'Децентрализованный P2P‑мессенджер: чаты и звонки без сервера',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        categories: ['social', 'communication'],
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'maskable'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,webp,jpg,jpeg,woff2,wasm}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
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
      // Tauri/Capacitor plugins are only loaded via dynamic import behind
      // platform checks — exclude them from the web bundle.
      external: [
        '@tauri-apps/plugin-dialog',
        '@tauri-apps/api/core',
        '@tauri-apps/api/event',
        '@capawesome/capacitor-file-picker',
      ],
      input: { main: './index.html' },
      output: {
        // Keep heavy, infrequently-changing deps in stable long-lived chunks
        // so the main entry stays small and browsers can cache them across
        // deploys. React lives in its own chunk because updating app code
        // shouldn't invalidate React itself.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'framer': ['framer-motion'],
          'peer': ['peerjs'],
          'idb': ['idb'],
          'scrypt': ['scrypt-js'],
          'icons': ['lucide-react']
        },
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
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // CSP: block inline script injection, allow data: for avatars,
      // allow peerjs/signaling/fonts, and wasm-unsafe-eval for crypto worker.
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob: mediastream:",
        "connect-src 'self' wss: ws: https:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')
    }
  }
}));
