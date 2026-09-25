import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const MODEL_DIR = path.resolve(import.meta.dirname, 'public/models')
const MODEL_RE = /\.(glb|gltf)$/i

/**
 * Exposes `virtual:model-manifest` — the list of .glb/.gltf files currently in
 * /public/models. Creatures look themselves up in it and swap their procedural
 * body for the user's model. In dev, adding/removing a model reloads the page.
 */
function modelManifest(): Plugin {
  const id = 'virtual:model-manifest'
  const resolved = '\0' + id
  return {
    name: 'model-manifest',
    resolveId(source) {
      if (source === id) return resolved
    },
    load(source) {
      if (source !== resolved) return
      const files = fs.existsSync(MODEL_DIR) ? fs.readdirSync(MODEL_DIR).filter((f) => MODEL_RE.test(f)) : []
      return `export default ${JSON.stringify(files)}`
    },
    configureServer(server) {
      server.watcher.add(MODEL_DIR)
      const onChange = (file: string) => {
        if (!file.startsWith(MODEL_DIR) || !MODEL_RE.test(file)) return
        const mod = server.moduleGraph.getModuleById(resolved)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), modelManifest()],
  server: { port: 5173 },
  assetsInclude: ['**/*.glb'],
  // small bundled assets (the default fish model) are inlined so the build
  // also works as a single self-contained file
  build: { assetsInlineLimit: 400_000, chunkSizeWarningLimit: 2000 },
})
