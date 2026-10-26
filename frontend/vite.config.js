import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Override to run several API instances side by side: API_TARGET=http://localhost:8091 npm run dev
        target: process.env.API_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        // Tell the API which host/port the browser used, so its requests count as same-origin on
        // whatever port Vite picked (5174, 5175... when 5173 is busy) instead of failing CORS with 403.
        xfwd: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    restoreMocks: true
  }
});
