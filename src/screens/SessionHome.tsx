import type { User } from '@supabase/supabase-js'
import type { Session } from '../core/model'
import { summarize } from '../core/stats'
import { fmtDuration } from '../core/format'
import { Icon } from '../components/Icon'

const initials = (n: string) =>
  n.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'C'

/** Accueil de l'onglet Séance : un seul gros bouton pour démarrer. */
export function SessionHome({ user, last, onNew, onOpenLast, onProfile }: {
  user?: User | null
  last?: Session
  onNew: () => void
  onOpenLast: (s: Session) => void
  onProfile: () => void
}) {
  const name = (user?.user_metadata?.name as string) || user?.email || 'Coach'
  const best = last ? summarize(last).best : undefined
  return (
    <div class="screen tabbed home">
      <header class="home-head px">
        <img src="/logo.png" alt="Torcy Canoë-Kayak" width={56} height={56} />
        <button class="home-avatar" onClick={onProfile} aria-label="Mon profil">{initials(name)}</button>
      </header>
      <div class="home-center">
        <div class="home-ring">
          <button class="home-btn" onClick={onNew}>
            <Icon name="plus" size={64} stroke={2.6} />
            <span>Nouvelle séance</span>
          </button>
        </div>
      </div>
      {last && (
        <button class="home-last" onClick={() => onOpenLast(last)}>
          <span>Dernière séance</span>
          <b class="mono">{best ? fmtDuration(best.time) : '—'}</b>
          <Icon name="right" size={18} />
        </button>
      )}
    </div>
  )
}
