import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '小日子 Little Days',
        short_name: '小日子',
        lang: 'zh-CN',
        theme_color: '#78896e',
        background_color: '#faf8f2',
        display: 'standalone',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//, /^\/functions\//],
      },
    }),
  ],
  build: {
    outDir: mode === 'test' ? '.test-dist' : 'dist',
    rollupOptions: mode === 'test'
      ? { input: { app: 'index.html', harness: 'tests/harness.html' } }
      : undefined,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    maxWorkers: 2,
  },
}));
