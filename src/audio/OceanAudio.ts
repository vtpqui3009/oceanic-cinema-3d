import audioFiles from 'virtual:audio-manifest'

/**
 * Generative ocean score, synthesised live with Web Audio (0 KB of assets).
 *
 * Everything runs on the browser's audio thread; the main thread only
 *  - schedules a handful of note events ~5×/s (look-ahead scheduler), and
 *  - nudges a few parameters ~10×/s with setTargetAtTime when depth changes.
 *
 * Layers, cross-faded by depth (stageF 0…3):
 *  0 shallows  — bright pad, pentatonic glass bells, surf wash
 *  1 twilight  — suspended pad, distant whale song
 *  2 midnight  — minor pad, sonar pings with echo
 *  3 abyss     — sub drone, slow heartbeat, rare hull creaks
 * Plus interaction sounds: discovery chime, glow sparkle, bubbles, UI ticks.
 *
 * Drop `ambient.mp3` or `zone-0..3.mp3` into /public/audio to replace the
 * generated music (the interaction sounds stay synthesised).
 */

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]

/** Four chords per zone (MIDI), darker and lower with depth. */
const CHORDS: number[][][] = [
  [[50, 57, 62, 66, 69], [52, 59, 64, 68, 71], [47, 54, 59, 62, 66], [45, 52, 57, 61, 64]], // D lydian-ish, open
  [[45, 52, 57, 59, 64], [43, 50, 55, 57, 62], [41, 48, 53, 55, 60], [43, 50, 55, 59, 62]], // suspended
  [[38, 45, 50, 53, 57], [36, 43, 48, 51, 55], [34, 41, 46, 50, 53], [36, 43, 48, 53, 55]], // minor
  [[26, 33, 38, 41, 45], [27, 34, 39, 42, 46], [26, 33, 38, 41, 44], [24, 31, 36, 39, 43]], // phrygian, low
]
const BELLS = [74, 76, 78, 81, 83, 86, 88, 90, 93]
const CHORD_SECONDS = 16

type Layer = 'pad' | 'surf' | 'sub'

export class OceanAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private reverb!: ConvolverNode
  private reverbIn!: GainNode
  private echo!: DelayNode
  private echoIn!: GainNode
  private padFilter!: BiquadFilterNode
  private padVoices: { a: OscillatorNode; b: OscillatorNode; g: GainNode }[] = []
  private layerGain = {} as Record<Layer, GainNode>
  private surfFilter!: BiquadFilterNode
  private sub!: OscillatorNode
  private noise!: AudioBuffer
  private timer = 0
  private depth = 0
  private weights = [1, 0, 0, 0]
  private next = { chord: 0, bell: 0, whale: 0, sonar: 0, heart: 0, creak: 0 }
  private chordIndex = 0
  private zoneForChords = 0
  private files: HTMLAudioElement[] = []
  private muted = false
  reducedMotion = false

  get running() {
    return this.ctx?.state === 'running' && !this.muted
  }

  /** Must be called from a user gesture (click/tap). */
  start() {
    if (this.ctx) {
      this.setMuted(false)
      return
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC({ latencyHint: 'playback' })
    this.ctx = ctx
    const t = ctx.currentTime

    // master chain: buses → soft compressor → master
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.attack.value = 0.02
    comp.release.value = 0.4
    this.master = ctx.createGain()
    this.master.gain.setValueAtTime(0, t)
    this.master.gain.linearRampToValueAtTime(0.9, t + 3) // fade in
    comp.connect(this.master).connect(ctx.destination)
    this.musicBus = ctx.createGain()
    this.sfxBus = ctx.createGain()
    this.musicBus.connect(comp)
    this.sfxBus.connect(comp)

    // one shared hall reverb, impulse generated once
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.makeImpulse(4.2, 2.6)
    this.reverbIn = ctx.createGain()
    this.reverbIn.gain.value = 0.9
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    this.reverbIn.connect(this.reverb).connect(wet).connect(comp)

    // echo for sonar and sparkles
    this.echo = ctx.createDelay(2)
    this.echo.delayTime.value = 0.46
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const echoLp = ctx.createBiquadFilter()
    echoLp.type = 'lowpass'
    echoLp.frequency.value = 2200
    this.echoIn = ctx.createGain()
    this.echoIn.connect(this.echo).connect(echoLp).connect(fb).connect(this.echo)
    echoLp.connect(this.reverbIn)
    echoLp.connect(this.musicBus)

    this.noise = this.makeNoise(3)

    // pad: 5 voices × 2 detuned oscillators through one low-pass
    this.padFilter = ctx.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 2200
    this.padFilter.Q.value = 0.6
    this.layerGain.pad = ctx.createGain()
    this.layerGain.pad.gain.value = 0.55
    this.padFilter.connect(this.layerGain.pad)
    this.layerGain.pad.connect(this.musicBus)
    this.layerGain.pad.connect(this.reverbIn)
    const breath = ctx.createOscillator() // slow swell on the pad
    breath.frequency.value = 0.07
    const breathDepth = ctx.createGain()
    breathDepth.gain.value = 0.12
    breath.connect(breathDepth).connect(this.layerGain.pad.gain)
    breath.start()
    const first = CHORDS[0][0]
    for (let i = 0; i < first.length; i++) {
      const g = ctx.createGain()
      g.gain.value = 0.06 / (1 + i * 0.25)
      const a = ctx.createOscillator()
      const b = ctx.createOscillator()
      a.type = 'triangle'
      b.type = 'sine'
      a.frequency.value = midi(first[i])
      b.frequency.value = midi(first[i])
      a.detune.value = -6 - i
      b.detune.value = 7 + i
      a.connect(g)
      b.connect(g)
      g.connect(this.padFilter)
      a.start()
      b.start()
      this.padVoices.push({ a, b, g })
    }

    // surf: looping noise, band-passed, slowly swelling like waves overhead
    const surf = ctx.createBufferSource()
    surf.buffer = this.noise
    surf.loop = true
    this.surfFilter = ctx.createBiquadFilter()
    this.surfFilter.type = 'bandpass'
    this.surfFilter.frequency.value = 520
    this.surfFilter.Q.value = 0.7
    this.layerGain.surf = ctx.createGain()
    this.layerGain.surf.gain.value = 0.05
    const swell = ctx.createOscillator()
    swell.frequency.value = 0.11
    const swellDepth = ctx.createGain()
    swellDepth.gain.value = 0.035
    swell.connect(swellDepth).connect(this.layerGain.surf.gain)
    surf.connect(this.surfFilter).connect(this.layerGain.surf).connect(this.musicBus)
    surf.start()
    swell.start()

    // sub drone for the deep
    this.sub = ctx.createOscillator()
    this.sub.type = 'sine'
    this.sub.frequency.value = midi(26)
    this.layerGain.sub = ctx.createGain()
    this.layerGain.sub.gain.value = 0
    this.sub.connect(this.layerGain.sub).connect(this.musicBus)
    this.sub.start()

    // optional user music replaces the generated layers
    this.setupFiles()

    const now = ctx.currentTime
    this.next = { chord: now + CHORD_SECONDS, bell: now + 1.5, whale: now + 8, sonar: now + 3, heart: now + 1, creak: now + 10 }
    this.applyDepth(true)
    this.schedule()

    document.addEventListener('visibilitychange', this.onVisibility)
  }

  setMuted(m: boolean) {
    this.muted = m
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.35)
    if (m) {
      window.setTimeout(() => this.muted && ctx.suspend(), 1500)
      this.files.forEach((f) => f.pause())
    } else {
      ctx.resume()
      this.syncFiles()
    }
  }

  /** Depth as continuous stage index 0…3; cheap to call, applied ≤10×/s. */
  setDepth(stageF: number) {
    this.depth = stageF
  }

  // ---- interaction sounds ---------------------------------------------------

  /** A new species discovered: rising glass arpeggio. */
  discover() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    const root = pick([74, 76, 79])
    ;[0, 4, 7, 12, 16].forEach((iv, i) => this.bell(midi(root + iv), ctx.currentTime + i * 0.09, 0.16, 2.8))
  }

  /** Re-opening a known species: one soft tone. */
  revisit() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    this.bell(midi(pick(BELLS)), ctx.currentTime, 0.1, 2)
  }

  /** Tap on open water: a shimmer of plankton light. */
  sparkle(zone: number) {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    const base = [86, 81, 76, 72][Math.max(0, Math.min(3, zone))]
    const n = this.reducedMotion ? 3 : 6
    for (let i = 0; i < n; i++) {
      const f = midi(base + pick([0, 2, 4, 7, 9, 12]))
      this.bell(f, ctx.currentTime + i * 0.045 + Math.random() * 0.03, 0.05, 0.9, true)
    }
  }

  /** A few rising bubble chirps (fast scrolling in the shallows, taps). */
  bubbles(count = 4) {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * rand(0.03, 0.09)
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const f = rand(380, 900)
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.07)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.05, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09)
      o.connect(g).connect(this.sfxBus)
      g.connect(this.reverbIn)
      o.start(t)
      o.stop(t + 0.1)
    }
  }

  ui(open: boolean) {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(open ? 660 : 520, t)
    o.frequency.exponentialRampToValueAtTime(open ? 990 : 390, t + 0.12)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g).connect(this.sfxBus)
    o.start(t)
    o.stop(t + 0.3)
  }

  /** The whole logbook complete: a long major swell. */
  complete() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    ;[50, 57, 62, 66, 69, 74, 78, 81].forEach((m, i) => this.bell(midi(m), ctx.currentTime + i * 0.12, 0.09, 5))
  }

  /** Called when the humpback crosses: a full whale phrase, closer. */
  whaleNearby() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    this.whale(ctx.currentTime + 0.2, 1.6)
  }

  // ---- explore mode ----------------------------------------------------------

  /** Camera shutter: a filtered click, then the shutter curtain. */
  shutter() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    const t = ctx.currentTime
    ;[0, 0.055].forEach((d, i) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const hp = ctx.createBiquadFilter()
      hp.type = 'bandpass'
      hp.frequency.value = i ? 2600 : 4200
      hp.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + d)
      g.gain.exponentialRampToValueAtTime(i ? 0.16 : 0.22, t + d + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05)
      src.connect(hp).connect(g).connect(this.sfxBus)
      src.start(t + d, rand(0, 1))
      src.stop(t + d + 0.07)
    })
  }

  /** Active sonar: a strong ping with a long echo tail. */
  sonarPing() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    this.sonar(ctx.currentTime + 0.02, 2.2)
  }

  /** Two soft falling beeps: oxygen running low. */
  oxygenLow() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    const t = ctx.currentTime
    ;[0, 0.22].forEach((d, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(i ? 740 : 880, t + d)
      g.gain.setValueAtTime(0.0001, t + d)
      g.gain.exponentialRampToValueAtTime(0.06, t + d + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18)
      o.connect(g).connect(this.sfxBus)
      o.start(t + d)
      o.stop(t + d + 0.2)
    })
  }

  /** The hull complaining about the pressure. */
  hullCreak() {
    const ctx = this.ctx
    if (!this.running || !ctx) return
    this.creak(ctx.currentTime, 1.6)
    this.thump(ctx.currentTime + 0.05, 0.3)
  }

  // ---- internals -------------------------------------------------------------

  private onVisibility = () => {
    const ctx = this.ctx
    if (!ctx || this.muted) return
    if (document.hidden) ctx.suspend()
    else ctx.resume()
  }

  private schedule = () => {
    const ctx = this.ctx
    if (!ctx) return
    this.applyDepth(false)
    if (ctx.state === 'running') {
      const horizon = ctx.currentTime + 0.35
      const [w0, w1, w2, w3] = this.weights
      const synth = this.files.length === 0

      if (synth && this.next.chord < horizon) {
        this.nextChord(this.next.chord)
        this.next.chord += CHORD_SECONDS
      }
      if (this.next.bell < horizon) {
        const w = synth ? w0 + w1 * 0.35 : 0
        if (w > 0.05 && Math.random() < w) this.bell(midi(pick(BELLS) - (w1 > w0 ? 12 : 0)), this.next.bell, 0.045 * w, 2.4)
        this.next.bell += rand(0.7, 2.6)
      }
      if (this.next.whale < horizon) {
        const w = synth ? w1 + w0 * 0.25 : 0
        if (w > 0.1) this.whale(this.next.whale, w)
        this.next.whale += rand(14, 26)
      }
      if (this.next.sonar < horizon) {
        const w = synth ? w2 : 0
        if (w > 0.1) this.sonar(this.next.sonar, w)
        this.next.sonar += rand(5.5, 9)
      }
      if (this.next.heart < horizon) {
        const w = synth ? w3 : 0
        if (w > 0.1 && !this.reducedMotion) {
          this.thump(this.next.heart, 0.22 * w)
          this.thump(this.next.heart + 0.28, 0.14 * w)
        }
        this.next.heart += 2.3
      }
      if (this.next.creak < horizon) {
        const w = synth ? w3 : 0
        if (w > 0.2) this.creak(this.next.creak, w)
        this.next.creak += rand(16, 30)
      }
    }
    this.timer = window.setTimeout(this.schedule, 200)
  }

  private applyDepth(immediate: boolean) {
    const ctx = this.ctx!
    const s = Math.max(0, Math.min(3, this.depth))
    const w = [0, 1, 2, 3].map((i) => Math.max(0, 1 - Math.abs(s - i)))
    this.weights = w
    const t = ctx.currentTime
    const tc = immediate ? 0.01 : 1.2
    // the pad darkens and thins with depth; the surf and bells fade out
    this.padFilter.frequency.setTargetAtTime(2400 * Math.pow(0.42, s), t, tc)
    this.surfFilter.frequency.setTargetAtTime(520 - s * 120, t, tc)
    this.layerGain.surf.gain.setTargetAtTime(this.files.length ? 0 : 0.05 * w[0], t, tc)
    this.layerGain.sub.gain.setTargetAtTime(this.files.length ? 0 : 0.11 * w[3] + 0.04 * w[2], t, tc)
    this.layerGain.pad.gain.setTargetAtTime(this.files.length ? 0 : 0.55 - 0.08 * s, t, tc)
    // move the chord set when the zone changes, without waiting a whole bar
    const zone = Math.round(s)
    if (zone !== this.zoneForChords && !immediate) {
      this.zoneForChords = zone
      this.nextChord(t)
      this.next.chord = t + CHORD_SECONDS
    }
    this.syncFiles()
  }

  private nextChord(at: number) {
    const set = CHORDS[this.zoneForChords]
    this.chordIndex = (this.chordIndex + 1) % set.length
    const chord = set[this.chordIndex]
    this.padVoices.forEach((v, i) => {
      const f = midi(chord[i % chord.length])
      v.a.frequency.setTargetAtTime(f, at, 1.6)
      v.b.frequency.setTargetAtTime(f, at, 1.9)
    })
  }

  private bell(freq: number, at: number, level: number, decay: number, echo = false) {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level, at + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    const o = ctx.createOscillator()
    o.frequency.value = freq
    const o2 = ctx.createOscillator() // inharmonic partial = glassy
    o2.frequency.value = freq * 2.76
    const g2 = ctx.createGain()
    g2.gain.setValueAtTime(0.35, at)
    g2.gain.exponentialRampToValueAtTime(0.0001, at + decay * 0.3)
    o.connect(g)
    o2.connect(g2).connect(g)
    g.connect(this.sfxBus)
    g.connect(this.reverbIn)
    if (echo) g.connect(this.echoIn)
    o.start(at)
    o2.start(at)
    o.stop(at + decay + 0.05)
    o2.stop(at + decay + 0.05)
  }

  private whale(at: number, w: number) {
    const ctx = this.ctx!
    const dur = rand(2.8, 4.2)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const base = rand(140, 220)
    o.frequency.setValueAtTime(base, at)
    o.frequency.exponentialRampToValueAtTime(base * rand(1.6, 2.2), at + dur * 0.45)
    o.frequency.exponentialRampToValueAtTime(base * rand(0.55, 0.8), at + dur)
    const vib = ctx.createOscillator()
    vib.frequency.value = rand(4, 6)
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 6
    vib.connect(vibDepth).connect(o.frequency)
    const formant = ctx.createBiquadFilter()
    formant.type = 'bandpass'
    formant.frequency.value = 700
    formant.Q.value = 5
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1300
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.09 * w, at + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(formant).connect(lp).connect(g)
    g.connect(this.reverbIn) // mostly reverb: it comes from far away
    const dry = ctx.createGain()
    dry.gain.value = 0.25
    g.connect(dry).connect(this.musicBus)
    o.start(at)
    vib.start(at)
    o.stop(at + dur + 0.1)
    vib.stop(at + dur + 0.1)
  }

  private sonar(at: number, w: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.value = 1320
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.05 * w, at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1)
    o.connect(g)
    g.connect(this.echoIn)
    g.connect(this.reverbIn)
    o.start(at)
    o.stop(at + 1.2)
  }

  private thump(at: number, level: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(62, at)
    o.frequency.exponentialRampToValueAtTime(36, at + 0.22)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(level, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
    o.connect(g).connect(this.musicBus)
    o.start(at)
    o.stop(at + 0.4)
  }

  private creak(at: number, w: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 12
    bp.frequency.setValueAtTime(rand(180, 260), at)
    bp.frequency.exponentialRampToValueAtTime(rand(90, 140), at + 1.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.12 * w, at + 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2)
    src.connect(bp).connect(g)
    g.connect(this.reverbIn)
    src.start(at, rand(0, 2))
    src.stop(at + 2.1)
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b = 0
    for (let i = 0; i < d.length; i++) {
      // brown-ish noise: softer than white, closer to water
      b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02
      d[i] = b * 3.5
    }
    return buf
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
  }

  // ---- optional user music ------------------------------------------------------

  private setupFiles() {
    const ctx = this.ctx!
    const base = `${import.meta.env.BASE_URL}audio/`
    const zones = [0, 1, 2, 3].map((i) => audioFiles.find((f) => new RegExp(`^zone-${i}\\.`, 'i').test(f)))
    const ambient = audioFiles.find((f) => /^ambient\./i.test(f))
    const list = zones.every(Boolean) ? (zones as string[]) : ambient ? [ambient] : []
    this.files = list.map((f) => {
      const el = new Audio(base + f)
      el.loop = true
      el.crossOrigin = 'anonymous'
      const g = ctx.createGain()
      g.gain.value = 0
      ctx.createMediaElementSource(el).connect(g).connect(this.musicBus)
      ;(el as HTMLAudioElement & { gain?: GainNode }).gain = g
      return el
    })
  }

  private syncFiles() {
    const ctx = this.ctx
    if (!ctx || !this.files.length) return
    this.files.forEach((el, i) => {
      const w = this.files.length === 1 ? 1 : this.weights[i]
      const g = (el as HTMLAudioElement & { gain?: GainNode }).gain!
      g.gain.setTargetAtTime(0.8 * w, ctx.currentTime, 1.5)
      if (w > 0.01 && !this.muted && el.paused) void el.play().catch(() => {})
      else if (w <= 0.01 && !el.paused) el.pause()
    })
  }

  dispose() {
    window.clearTimeout(this.timer)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.files.forEach((f) => f.pause())
    void this.ctx?.close()
    this.ctx = null
  }
}

/** The single engine instance (created lazily on the first user gesture). */
export const oceanAudio = new OceanAudio()
