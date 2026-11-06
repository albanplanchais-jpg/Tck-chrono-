import { useEffect, useRef } from 'preact/hooks'
import { Icon } from './Icon'

export type Tab = 'session' | 'courses' | 'history' | 'athletes' | 'profile'

export interface TabDef<T extends string> { id: T; label: string; icon: string }

const TABS: TabDef<Tab>[] = [
  { id: 'session', label: 'Séance', icon: 'stopwatch' },
  { id: 'courses', label: 'Parcours', icon: 'flag' },
  { id: 'history', label: 'Historique', icon: 'list' },
  { id: 'athletes', label: 'Athlètes', icon: 'users' },
  { id: 'profile', label: 'Profil', icon: 'user' }
]

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Barre d'onglets « Liquid Glass » : au toucher, une bulle de verre plus grande que la barre
 * suit le doigt et grossit l'onglet survolé ; au relâcher elle se pose en pastille sous l'onglet choisi.
 *
 * Le geste est géré directement sur le DOM (attributs data-*, variable --lx), sans re-rendu :
 * un toucher très rapide n'est jamais perdu et la bulle suit le doigt sans saccade.
 */
export function TabBar<T extends string = Tab>({ tab, onChange, tabs = TABS as unknown as TabDef<T>[], class: cls = '' }: {
  tab: T
  onChange: (t: T) => void
  tabs?: TabDef<T>[]
  class?: string
}) {
  const nav = useRef<HTMLElement>(null)
  const press = useRef<{ id: number; over: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  // Valeurs à jour pour les gestionnaires (évite les fermetures périmées).
  const latest = useRef({ tab, onChange, tabs })
  latest.current = { tab, onChange, tabs }
  const n = tabs.length
  const active = Math.max(0, tabs.findIndex((t) => t.id === tab))

  useEffect(() => () => clearTimeout(timer.current), [])

  const geo = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, w: r.width, slot: (r.width - 8) / n }
  }
  const at = (el: HTMLElement, clientX: number) => {
    const g = geo(el)
    const x = Math.min(Math.max(clientX - g.left, 4 + g.slot * 0.62), g.w - 4 - g.slot * 0.62)
    const over = Math.min(n - 1, Math.max(0, Math.floor((clientX - g.left - 4) / g.slot)))
    return { x, over }
  }
  const light = (el: HTMLElement, i: number) =>
    el.querySelectorAll<HTMLElement>(':scope > button').forEach((b, j) => {
      if (j === i) b.dataset.lit = ''
      else delete b.dataset.lit
    })
  const reset = (el: HTMLElement) => {
    press.current = null
    delete el.dataset.state
    light(el, -1)
  }

  const down = (e: PointerEvent) => {
    const el = nav.current
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return
    clearTimeout(timer.current)
    try { el.setPointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    const { x, over } = at(el, e.clientX)
    press.current = { id: e.pointerId, over }
    el.style.setProperty('--lx', `${x}px`)
    el.dataset.state = 'pressing'
    light(el, over)
  }
  const move = (e: PointerEvent) => {
    const el = nav.current
    const p = press.current
    if (!el || !p || p.id !== e.pointerId) return
    const { x, over } = at(el, e.clientX)
    el.style.setProperty('--lx', `${x}px`)
    if (over !== p.over) { p.over = over; light(el, over) }
  }
  const up = (e: PointerEvent) => {
    const el = nav.current
    const p = press.current
    if (!el || !p || p.id !== e.pointerId) return
    const { over } = at(el, e.clientX)
    reset(el)
    if (!reduced()) {
      const g = geo(el)
      el.style.setProperty('--lx', `${4 + g.slot * over + g.slot / 2}px`)
      el.dataset.state = 'settling'
      timer.current = window.setTimeout(() => { if (el.dataset.state === 'settling') delete el.dataset.state }, 450)
    }
    const { tab: cur, onChange: go, tabs: list } = latest.current
    if (list[over] && list[over].id !== cur) go(list[over].id)
  }
  const cancel = (e: PointerEvent) => {
    const el = nav.current
    if (el && press.current?.id === e.pointerId) reset(el)
  }

  return (
    <nav
      ref={nav}
      class={`tabbar ${cls}`}
      aria-label="Navigation"
      style={{ '--i': active, '--n': n }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="tab-lens" aria-hidden="true" />
      {tabs.map((t) => (
        <button
          key={t.id}
          class={tab === t.id ? 'on' : ''}
          aria-current={tab === t.id ? 'page' : undefined}
          // Doigt / souris : géré par la barre (glisser). Clavier (detail = 0) : ici.
          onClick={(e) => { if (e.detail === 0) onChange(t.id) }}
        >
          <Icon name={t.icon} size={22} stroke={2} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
