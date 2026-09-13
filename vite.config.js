import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Without this, a crash in production only ever shows minified
  // names like "el" or "ns" — permanently undecodable. With it, the
  // exact same error shows the real file and line, because the
  // browser applies the map automatically.
  build: { sourcemap: true },
})
