import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: { port: 3091, host: '0.0.0.0' },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@components': path.resolve(__dirname, 'components'),
      '@screens': path.resolve(__dirname, 'screens'),
      '@services': path.resolve(__dirname, 'services'),
      '@routes': path.resolve(__dirname, 'routes'),
      '@contexts': path.resolve(__dirname, 'contexts'),
    },
  },
});
