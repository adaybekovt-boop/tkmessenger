import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Use relative base for maximum compatibility with GitHub Pages and local builds
  base: './',
  plugins: [
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Orbits P2P',
        short_name: 'Orbits',
        description: 'Decentralized P2P Messenger',
        theme_color: '#1a1a1f',
        background_color: '#05050A',
        display: 'standalone',
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
  worker: { format: 'es' },
  server: { port: 5173 }
}));
