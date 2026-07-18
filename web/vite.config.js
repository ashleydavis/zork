import { defineConfig } from 'vite'

// Served from https://<user>.github.io/zork/ on GitHub Pages.
export default defineConfig({
  root: '.',
  base: process.env.VITE_BASE || '/zork/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
})
