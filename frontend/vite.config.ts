import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env.VITE_API_BASE_URL ||
        process.env.VITE_API_URL ||
        process.env.VITE_BACKEND_URL ||
        process.env.API_BASE_URL ||
        process.env.BACKEND_URL ||
        'http://localhost:8080'
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
