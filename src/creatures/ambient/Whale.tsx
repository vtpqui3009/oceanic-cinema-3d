import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { oceanAudio } from '../../audio/OceanAudio'
import { useDiscoverable } from '../../interaction/discoverables'
import { deform } from '../../lib/deform'
import { ZONE_Y, dive } from '../../lib/dive'
import { useSceneStore } from '../../state/useSceneStore'
import { useExperienceStore } from '../../state/useExperienceStore'

/** Scroll window in which the whale can appear (between zones I and II). */
const WINDOW: [number, number] = [0.15, 0.34]
const SPEED = 2.3
const SPAN = 40
const AHEAD = 17

function paint(g: THREE.BufferGeometry, fn: (x: number, _y: number, z: number, ny: number) => [number, number, number]) {
  const p = g.attributes.position as THREE.BufferAttribute
  const n = g.attributes.normal as THREE.BufferAttribute
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) c.set(fn(p.getX(i), p.getY(i), p.getZ(i), n.getY(i)), i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

/** Blade (pectoral fin or fluke) as a tapered strip in the XZ plane. */
function blade(len: number, width: (t: number) => number, sweep: (t: number) => number, segs = 16) {
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const w = width(t)
    const x = sweep(t)
    // knobbly leading edge (the humpback's tubercles)
    const knob = 0.04 * Math.max(0, Math.sin(t * 40))
    pos.push(x + w * 0.35 + knob, 0.03 * (1 - t), t * len, x - w * 0.65, -0.03 * (1 - t), t * len)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setIndex(idx)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

function whaleGeometry() {
  // body: lathe around Y (head up), then laid along +X (head forward)
  const prof = [
    [0, -4.6], [0.12, -4.4], [0.2, -3.8], [0.45, -2.8], [0.8, -1.6], [1.05, -0.4], [1.12, 0.8],
    [1.05, 1.9], [0.9, 2.9], [0.66, 3.8], [0.38, 4.35], [0, 4.55],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const body = new THREE.LatheGeometry(prof, 28)
  body.rotateZ(-Math.PI / 2)
  body.scale(1, 0.92, 1)
  const parts: THREE.BufferGeometry[] = [body.toNonIndexed()]
  body.dispose()
  // long pectoral fins, swept back and down
  for (const side of [1, -1]) {
    const fin = blade(3.4, (t) => 0.55 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.08, (t) => -t * 1.5)
    if (side < 0) fin.scale(1, 1, -1)
    // angled down and out, so the long white fins read from the side
    fin.rotateX(side * 0.75)
    fin.translate(1.9, -0.55, side * 0.85)
    parts.push(fin.toNonIndexed())
    fin.dispose()
  }
  // flukes
  for (const side of [1, -1]) {
    const f = blade(2.1, (t) => 0.75 * (1 - t * 0.7) + 0.05, (t) => -t * t * 0.9)
    if (side < 0) f.scale(1, 1, -1)
    f.translate(-4.35, 0, 0)
    parts.push(f.toNonIndexed())
    f.dispose()
  }
  parts.forEach((p) => {
    p.deleteAttribute('normal')
    p.deleteAttribute('uv')
  })
  const g = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  g.computeVertexNormals()
  // countershading: slate back, pale throat and white pectorals
  return paint(g, (x, _y, z, ny) => {
    const pec = Math.abs(z) > 1.3 && x > -1.8 && x < 2.6 ? 1 : 0
    const belly = THREE.MathUtils.smoothstep(-ny, 0.1, 0.8)
    const v = 0.1 + belly * 0.45 + pec * 0.55
    return [v * 0.9, v * 0.97, v]
  })
}

/**
 * The secret: a humpback whale crossing the water column between the sunlit
 * shallows and the twilight zone, singing as it passes. It exists only while
 * the camera is in that stretch of the dive; its swim is a vertex-shader
 * body wave plus one transform per frame.
 */
export function Whale() {
  const reduced = useSceneStore((s) => s.reducedMotion)
  const group = useRef<THREE.Group>(null!)
  const mesh = useRef<THREE.Mesh>(null!)
  const uTime = useMemo(() => ({ value: 0 }), [])
  const camera = useThree((s) => s.camera)
  const state = useMemo(
    () => ({ t0: -1, visible: false, sang: false, c: new THREE.Vector3(), origin: new THREE.Vector3(), side: new THREE.Vector3(), fwd: new THREE.Vector3() }),
    [],
  )
  const { geometry, material } = useMemo(
    () => ({ geometry: whaleGeometry(), material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }) }),
    [],
  )

  useLayoutEffect(() => {
    deform(mesh.current, material, {
      key: 'whale-swim',
      uniforms: { uTime },
      head: 'uniform float uTime;',
      // vertical body wave growing towards the flukes; slow pectoral strokes
      body: /* glsl */ `
        float tailW = smoothstep(1.0, -4.6, position.x);
        transformed.y += sin(uTime * 0.85 - position.x * 0.42) * 0.42 * tailW * tailW;
        float pec = smoothstep(0.9, 3.5, abs(position.z)) * step(-1.5, position.x) * step(position.x, 2.4);
        transformed.y += sin(uTime * 0.45) * 0.55 * pec;`,
    })
  }, [material, uTime])

  useDiscoverable(
    'whale',
    useMemo(
      () => ({
        zone: null,
        active: () => state.visible,
        sample: (emit: (c: THREE.Vector3, r: number) => void) => emit(group.current.getWorldPosition(state.c), 5),
      }),
      [state],
    ),
  )

  useFrame(({ clock }) => {
    // (also shown during the loader's warm-up tour, so its shaders are ready)
    // explore mode: it cruises through the upper twilight zone
    const inWindow = dive.game
      ? !reduced && camera.position.y > ZONE_Y[1] + 3 && camera.position.y < ZONE_Y[1] + 17
      : !reduced && (useExperienceStore.getState().started || dive.override >= 0) && dive.p > WINDOW[0] && dive.p < WINDOW[1]
    const t = clock.elapsedTime
    if (inWindow && state.t0 < 0) {
      // enter from off-screen, crossing the view a little below the lens
      state.t0 = t
      state.sang = false
      camera.getWorldDirection(state.fwd)
      state.fwd.y = Math.max(state.fwd.y, -0.35)
      state.fwd.normalize()
      state.side.crossVectors(state.fwd, THREE.Object3D.DEFAULT_UP).normalize()
      state.origin.copy(camera.position).addScaledVector(state.fwd, dive.game ? 12 : AHEAD)
      state.origin.y -= 2.5
      group.current.rotation.set(0, Math.atan2(-state.side.z, state.side.x), 0)
    }
    const age = state.t0 < 0 ? -1 : t - state.t0
    const x = -SPAN / 2 + age * SPEED
    const crossing = age >= 0 && x < SPAN / 2
    // restart the pass a while after it ends, if the viewer lingers here
    if (!crossing && state.t0 >= 0 && (!inWindow || age > SPAN / SPEED + 12)) state.t0 = -1
    // the warm-up pass must not use up the real one
    if (dive.override >= 0 && state.t0 >= 0 && dive.p >= WINDOW[1] - 0.05) state.t0 = -1
    state.visible = crossing && inWindow
    group.current.visible = state.visible
    if (!state.visible) return
    uTime.value = t
    group.current.position.copy(state.origin).addScaledVector(state.side, x)
    group.current.position.y += Math.sin(age * 0.3) * 0.6
    group.current.rotation.z = Math.sin(age * 0.3 + 1.2) * 0.05
    if (!state.sang && age > 2) {
      state.sang = true
      oceanAudio.whaleNearby()
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}
