/**
 * Tiny keyframe track: rows of [time, ...values], sampled with eased lerp
 * between neighbouring keys (smoothstep, so every key is a soft stop).
 */
export function sampleKeys(keys: readonly (readonly number[])[], t: number, out: number[] = []): number[] {
  const n = keys[0].length - 1
  if (t <= keys[0][0]) return copy(keys[0], out)
  if (t >= keys[keys.length - 1][0]) return copy(keys[keys.length - 1], out)
  let i = 0
  while (t > keys[i + 1][0]) i++
  const a = keys[i], b = keys[i + 1]
  const s = (t - a[0]) / (b[0] - a[0])
  const e = s * s * (3 - 2 * s)
  for (let k = 0; k < n; k++) out[k] = a[k + 1] + (b[k + 1] - a[k + 1]) * e
  return out
}

function copy(row: readonly number[], out: number[]) {
  for (let k = 1; k < row.length; k++) out[k - 1] = row[k]
  return out
}
