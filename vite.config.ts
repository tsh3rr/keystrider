import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three pages: the app, and the Impressum and privacy policy, which must be
// reachable by their own address (/impressum, /datenschutz).
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        impressum: resolve(import.meta.dirname, 'impressum.html'),
        datenschutz: resolve(import.meta.dirname, 'datenschutz.html'),
      },
    },
  },
});
