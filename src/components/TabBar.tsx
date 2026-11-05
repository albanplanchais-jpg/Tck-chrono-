import { Icon } from './Icon'

export type Tab = 'session' | 'history' | 'profile'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'session', label: 'Séance', icon: 'stopwatch' },
  { id: 'history', label: 'Historique', icon: 'list' },
  { id: 'profile', label: 'Profil', icon: 'user' }
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav class="tabbar" aria-label="Navigation">
      {TABS.map((t) => (
        <button key={t.id} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={22} stroke={2} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
