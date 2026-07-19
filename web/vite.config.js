import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at https://<user>.github.io/zork/.
// Pages is configured as "Deploy from a branch" using the /docs folder, so the
// production build is written to ../docs (repo root) and committed.
export default defineConfig({
  root: '.',
  base: process.env.VITE_BASE || '/zork/',
  plugins: [react()],
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    target: 'es2020',
  },
})
