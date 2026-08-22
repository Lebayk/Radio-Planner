import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' -> l'app fonctionne aussi bien a la racine (Vercel) que dans un
// sous-repertoire (GitHub Pages) sans reconfiguration.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
});
