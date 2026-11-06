import { useRef, useState } from 'preact/hooks'
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
 */
export function TabBar<T extends string = Tab>({ tab, onChange, tabs = TABS as unknown as TabDef<T>[], class: cls = '' }: {
  tab: T
  onChange: (t: T) => void
  tabs?: TabDef<T>[]
  class?: string
}) {
  const nav = useRef<HTMLElement>(null)
  // Doigt posé : position x de la bulle (px dans la barre) et onglet survolé.
  const [press, setPress] = useState<{ x: number; over: number } | null>(null)
  // Juste après le relâcher : la bulle se rétracte sur l'onglet choisi.
  const [settle, setSettle] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const n = tabs.length
  const active = Math.max(0, tabs.findIndex((t) => t.id === tab))

  const geo = () => {
    const r = nav.current!.getBoundingClientRect()
    return { left: r.left, w: r.width, slot: (r.width - 8) / n }
  }
  const at = (clientX: number) => {
    const g = geo()
    const x = Math.min(Math.max(clientX - g.left, 4 + g.slot * 0.62), g.w - 4 - g.slot * 0.62)
    const over = Math.min(n - 1, Math.max(0, Math.floor((clientX - g.left - 4) / g.slot)))
    return { x, over }
  }

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    nav.current!.setPointerCapture?.(e.pointerId)
    clearTimeout(timer.current)
    setSettle(null)
    setPress(at(e.clientX))
  }
  const move = (e: PointerEvent) => { if (press) setPress(at(e.clientX)) }
  const up = (e: PointerEvent) => {
    if (!press) return
    const { over } = at(e.clientX)
    setPress(null)
    if (!reduced()) {
      setSettle(over)
      timer.current = window.setTimeout(() => setSettle(null), 450)
    }
    if (tabs[over].id !== tab) onChange(tabs[over].id)
  }

  const g = nav.current ? geo() : null
  const lensX = press ? press.x : settle !== null && g ? 4 + g.slot * settle + g.slot / 2 : 0

  return (
    <nav
      ref={nav}
      class={`tabbar ${cls} ${press ? 'pressing' : ''} ${settle !== null ? 'settling' : ''}`}
      aria-label="Navigation"
      style={{ '--i': active, '--n': n, '--lx': `${lensX}px` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setPress(null)}
    >
      <span class="tab-lens" aria-hidden="true" />
      {tabs.map((t, i) => (
        <button
          key={t.id}
          class={`${tab === t.id ? 'on' : ''} ${press?.over === i ? 'lit' : ''}`}
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
