import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { suspend } from 'suspend-react'
import { useLoadingStore } from '../state/useLoadingStore'

/**
 * GLTF loading that survives strict Content-Security-Policies (e.g. the
 * published artifact, where `fetch()` may not read `data:`/`blob:` URLs):
 *  - an inlined `data:` model is base64-decoded here and parsed directly;
 *  - embedded textures are decoded through <img> (TextureLoader) instead of
 *    fetch + createImageBitmap (ImageBitmapLoader, three's default).
 */
const loader = new GLTFLoader()
loader.register((parser) => {
  ;(parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager)
  return { name: 'csp_safe_textures' }
})

function decodeDataUrl(url: string) {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function loadGLTF(url: string): Promise<GLTF> {
  return url.startsWith('data:') ? loader.parseAsync(decodeDataUrl(url), '') : loader.loadAsync(url)
}

/** Suspends until the model is ready, reporting progress under `label`. */
export function useSafeGLTF(url: string, label: string): GLTF {
  return suspend(async () => {
    useLoadingStore.getState().begin(label)
    try {
      return await loadGLTF(url)
    } finally {
      useLoadingStore.getState().end(label)
    }
  }, ['gltf', url])
}
