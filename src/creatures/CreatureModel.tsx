import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { useSceneStore } from '../state/useSceneStore'

interface Props {
  url: string
  /** Longest horizontal dimension after normalisation, in scene units. */
  length: number
  /** Clip name patterns in order of preference (first match plays). */
  preferClips?: RegExp[]
  /** Name pattern of the emissive organ to hang the bio light on. */
  anchorPattern?: RegExp
  /** Fallback anchor (normalised model space) if no node matches. */
  fallbackAnchor?: [number, number, number]
  /** Rendered inside the glowing organ (e.g. <BioLight/>). */
  anchorChildren?: ReactNode
  timeScale?: number
}

/**
 * Generic loader for user-supplied creature models: normalises scale and
 * pivot, enables shadows, plays the best-matching animation clip and, when
 * the model has several, crossfades between them.
 */
export function CreatureModel({
  url,
  length,
  preferClips = [/swim/i, /idle/i, /move/i],
  anchorPattern = /lure|esca|glow|light|bulb|photophore/i,
  fallbackAnchor = [0, 0.4, 0.6],
  anchorChildren,
  timeScale = 1,
}: Props) {
  const gltf = useGLTF(url)
  const group = useRef<THREE.Group>(null!)

  const { model, anchor } = useMemo(() => {
    const model = SkeletonUtils.clone(gltf.scene) as THREE.Group
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const s = length / Math.max(size.x, size.z, 1e-6)
    model.scale.setScalar(s)
    model.position.copy(centre).multiplyScalar(-s)
    let anchor: THREE.Object3D | undefined
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (m && 'envMapIntensity' in m) m.envMapIntensity = 1
      }
      if (!anchor && anchorPattern.test(o.name)) anchor = o
    })
    if (!anchor) {
      anchor = new THREE.Object3D()
      anchor.position.set(...fallbackAnchor).divideScalar(s).add(centre)
      model.add(anchor)
    }
    return { model, anchor }
  }, [gltf, length, anchorPattern, fallbackAnchor])

  const { actions, names, mixer } = useAnimations(gltf.animations, group)
  const reduced = useSceneStore((st) => st.reducedMotion)
  useEffect(() => {
    if (!names.length) return
    mixer.timeScale = reduced ? 0 : timeScale
    // preferred clips first (swim, idle…), then the rest
    const ordered = [
      ...preferClips.flatMap((re) => names.filter((n) => re.test(n))),
      ...names,
    ].filter((n, i, a) => a.indexOf(n) === i)
    let i = 0
    let current = actions[ordered[0]]!
    current.reset().fadeIn(0.8).play()
    if (ordered.length < 2 || reduced) return () => void current.fadeOut(0.8)
    // alternate between clips with a smooth crossfade, like an edit
    const id = window.setInterval(() => {
      i = (i + 1) % Math.min(ordered.length, 3)
      const next = actions[ordered[i]]!
      next.reset().play()
      current.crossFadeTo(next, 1.2, true)
      current = next
    }, 9000)
    return () => {
      window.clearInterval(id)
      current.fadeOut(0.8)
    }
  }, [actions, names, mixer, preferClips, timeScale, reduced])

  return (
    <group ref={group}>
      <primitive object={model} />
      {anchorChildren && createPortal(anchorChildren, anchor)}
    </group>
  )
}
