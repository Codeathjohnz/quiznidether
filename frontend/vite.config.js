import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Path of this project under XAMPP's htdocs (used by the dev-server proxy).
const XAMPP_PATH = '/xampp/Quiz%20ni%20Dether';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../app', // served by Apache at http://localhost/xampp/Quiz ni Dether/app/
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // During `npm run dev`, forward API calls to the PHP API running in XAMPP Apache.
      '/api': {
        target: 'http://localhost',
        changeOrigin: false,
        rewrite: (p) => XAMPP_PATH + p,
      },
    },
  },
});
