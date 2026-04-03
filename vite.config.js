import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: { main: './index.html' },
      output: {
        manualChunks: {
          peerjs: ['peerjs']
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: mode === 'production' ? 'terser' : 'esbuild',
    terserOptions:
      mode === 'production'
        ? { compress: { drop_console: true, drop_debugger: true }, format: { comments: false } }
        : {},
    target: 'esnext'
  },
  esbuild: {},
  worker: { format: 'es' },
  server: { port: 5173 }
}));
