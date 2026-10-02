import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayProxy = {
  target: process.env.VITE_GATEWAY_PROXY_TARGET ?? 'http://localhost:4000',
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': gatewayProxy,
      '/health': gatewayProxy,
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': gatewayProxy,
      '/health': gatewayProxy,
    },
  },
});
