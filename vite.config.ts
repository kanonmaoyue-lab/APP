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
        theme_color: '#f7dce8',
        background_color: '#fff5f9',
        display: 'standalone',
        icons: [{
          src: '/illustrations/cat-icon.png',
          sizes: '1254x1254',
          type: 'image/png',
          purpose: 'any',
        }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,txt}'],
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
