import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Exposes a virtual module listing the files currently in a /public folder.
 *  - `virtual:model-manifest`: .glb/.gltf in /public/models — creatures swap
 *    their procedural body for the user's model;
 *  - `virtual:audio-manifest`: audio in /public/audio — replaces the
 *    generative score.
 * In dev, adding/removing a file reloads the page.
 */
function fileManifest(id: string, folder: string, re: RegExp): Plugin {
  const dir = path.resolve(import.meta.dirname, 'public', folder)
  const resolved = '\0' + id
  return {
    name: `manifest:${folder}`,
    resolveId(source) {
      if (source === id) return resolved
    },
    load(source) {
      if (source !== resolved) return
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : []
      return `export default ${JSON.stringify(files)}`
    },
    configureServer(server) {
      server.watcher.add(dir)
      const onChange = (file: string) => {
        if (!file.startsWith(dir) || !re.test(file)) return
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
  plugins: [
    react(),
    fileManifest('virtual:model-manifest', 'models', /\.(glb|gltf)$/i),
    fileManifest('virtual:audio-manifest', 'audio', /\.(mp3|ogg|m4a|wav)$/i),
  ],
  server: { port: 5173 },
  assetsInclude: ['**/*.glb'],
  // small bundled assets (the default fish model) are inlined so the build
  // also works as a single self-contained file
  build: { assetsInlineLimit: 400_000, chunkSizeWarningLimit: 2000 },
})
