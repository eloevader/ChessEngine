import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/ChessEngine/',
  define: {
    // Build-time version constants. Injected as a string literal so
    // the version.ts module can read them.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})
