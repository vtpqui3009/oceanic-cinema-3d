import manifest from 'virtual:model-manifest'

export type CreatureId = 'anglerfish' | 'jellyfish' | 'squid' | 'fish'

export const CREATURES: Record<CreatureId, { label: string; latin: string }> = {
  fish: { label: 'Đàn cá chẽm non', latin: 'Lates calcarifer' },
  jellyfish: { label: 'Sứa vương miện', latin: 'Atolla wyvillei' },
  squid: { label: 'Mực đèn Dana', latin: 'Taningia danae' },
  anglerfish: { label: 'Cá câu vực thẳm', latin: 'Melanocetus johnsonii' },
}

/** URL of a user-supplied model in /public/models (e.g. anglerfish.glb), if any. */
export function userModelUrl(id: CreatureId): string | null {
  const file = manifest.find((f) => f.replace(/\.(glb|gltf)$/i, '').toLowerCase() === id)
  return file ? `${import.meta.env.BASE_URL}models/${file}` : null
}

/** Human label for a URL drei's loader reports as in-flight. */
export function labelForUrl(url: string | undefined): string | null {
  if (!url) return null
  // the bundled default fish is inlined as a data URI in production builds
  if (url.startsWith('data:model/gltf') || url.includes('barramundi')) return CREATURES.fish.label
  const hit = (Object.keys(CREATURES) as CreatureId[]).find((id) => url.toLowerCase().includes(`/${id}.`))
  return hit ? CREATURES[hit].label : null
}
