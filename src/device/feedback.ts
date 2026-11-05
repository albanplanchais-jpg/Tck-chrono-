import { getSettings } from '../store/settings'

let ctx: AudioContext | undefined

export function tapFeedback() {
  const { vibrate, beep } = getSettings()
  if (vibrate) try { navigator.vibrate?.(25) } catch {}
  if (beep) try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 1760
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.09)
  } catch {}
}

/** Bip de lancement (chrono général) : toujours joué, indépendamment du réglage « bip au tap ». */
export function launchBeep(long = false) {
  try { navigator.vibrate?.(long ? 300 : 60) } catch {}
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = long ? 1320 : 880
    const d = long ? 0.45 : 0.12
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + d + 0.02)
  } catch {}
}

/**
 * iPhone (Safari) : le son n'est autorisé qu'après un toucher. On prépare donc le contexte audio
 * au premier toucher, pour que les bips du chrono général (déclenchés par le minuteur) sonnent.
 */
export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    try {
      ctx ??= new AudioContext()
      if (ctx.state === 'suspended') ctx.resume()
      // Son silencieux très court : « réveille » la sortie audio sur iOS.
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      g.gain.value = 0
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + 0.01)
    } catch {}
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  // Au retour dans l'app, iOS peut suspendre le son : on le relance au toucher suivant.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  })
}
