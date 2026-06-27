import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Copy stockfish.wasm assets to public/ so they're served as static files.
function stockfishWasmPlugin() {
  const srcDir = resolve(__dirname, 'node_modules/stockfish.wasm')
  const outDir = resolve(__dirname, 'public/stockfish')
  const files = ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js']
  return {
    name: 'copy-stockfish-wasm',
    buildStart() {
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      for (const f of files) {
        copyFileSync(resolve(srcDir, f), resolve(outDir, f))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stockfishWasmPlugin()],
  base: '/ChessEngine/',
  define: {
    // Build-time version constants. Injected as a string literal so
    // the version.ts module can read them.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})
