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
