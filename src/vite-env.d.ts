/// <reference types="vite/client" />

declare module 'virtual:model-manifest' {
  /** File names of .glb/.gltf models present in /public/models at build/dev time. */
  const files: string[]
  export default files
}

declare module 'virtual:audio-manifest' {
  /** Audio files present in /public/audio at build/dev time. */
  const files: string[]
  export default files
}
