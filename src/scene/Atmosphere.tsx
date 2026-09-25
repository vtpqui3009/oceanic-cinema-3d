import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ATMOSPHERES, dive, sampleAtmosphere, type Atmosphere as Atm } from '../lib/dive'

/** Current water conditions, updated every frame (read by particles etc.). */
export const liveAtmosphere: Atm = sampleAtmosphere(0, {
  ...ATMOSPHERES[0],
  fog: ATMOSPHERES[0].fog.clone(),
  sky: ATMOSPHERES[0].sky.clone(),
  ground: ATMOSPHERES[0].ground.clone(),
})

/**
 * Water column: fog colour/density, background, the ambient "sky" light and
 * reflection strength all follow depth — sunlight fades out and cools from
 * turquoise to ink as the camera dives.
 */
export function Atmosphere() {
  const { scene, gl } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const { fog, background } = useMemo(() => {
    const fog = new THREE.FogExp2(ATMOSPHERES[0].fog.getHex(), ATMOSPHERES[0].density)
    return { fog, background: ATMOSPHERES[0].fog.clone() }
  }, [])
  scene.fog = fog
  scene.background = background

  useFrame(() => {
    const a = sampleAtmosphere(dive.stageF, liveAtmosphere)
    fog.color.copy(a.fog)
    fog.density = a.density
    background.copy(a.fog)
    hemi.current.color.copy(a.sky)
    hemi.current.groundColor.copy(a.ground)
    hemi.current.intensity = a.ambient
    scene.environmentIntensity = a.env
    gl.toneMappingExposure = a.exposure
  })

  return <hemisphereLight ref={hemi} />
}
