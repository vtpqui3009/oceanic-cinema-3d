import { useLayoutEffect } from 'react'
import { suspend } from 'suspend-react'
import { useLoadingStore } from '../state/useLoadingStore'

/**
 * Builds a procedural asset off the render path and suspends until it is
 * ready, reporting progress under `label`. Cached per key.
 */
export function useProcedural<T>(key: string, label: string, build: () => T): T {
  const result = suspend(
    () =>
      new Promise<T>((resolve) => {
        useLoadingStore.getState().begin(label)
        // yield a frame so the loader can paint "Đang tải …" before we block
        requestAnimationFrame(() =>
          setTimeout(() => {
            const r = build()
            useLoadingStore.getState().end(label)
            resolve(r)
          }, 0),
        )
      }),
    [key],
  )
  useLayoutEffect(() => useLoadingStore.getState().end(label), [label])
  return result
}
