import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/media': 'http://localhost:3000',
      '/ping': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist/client',
  },
});
