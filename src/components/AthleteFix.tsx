import { useMemo, useState } from 'preact/hooks'
import { KIND_LABEL, type Kind, type Session, type Tap } from '../core/model'
import { computeAthlete, stateAt } from '../core/results'
import { fmtClock, fmtDuration } from '../core/format'
import type { Store } from '../store/useSession'
import { Icon } from './Icon'

interface Props {
  store: Store
  session: Session
  athleteId: string
  onClose: () => void
  /** Message de confirmation + possibilité d'annuler. */
  onDone: (text: string, undo: Tap[]) => void
}

/**
 * Correction d'une erreur sur un athlète :
 * faux départ (annule le passage en cours) ou modification d'un de ses taps
 * (type, autre athlète, suppression).
 */
export function AthleteFix({ store, session, athleteId, onClose, onDone }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const athlete = session.athletes.find((a) => a.id === athleteId)!
  const splits = session.splits ?? 0
  const kinds: Kind[] = splits > 0 ? ['start', 'split', 'finish'] : ['start', 'finish']
  const res = useMemo(() => computeAthlete(athlete, session.taps), [athlete, session.taps])

  const taps = useMemo(
    () =>
      session.taps
        .filter((t) => !t.voided && t.athleteId === athleteId && t.kind)
        .sort((a, b) => b.t - a.t)
        .map((tap) => {
          const st = stateAt(session, tap).find((r) => r.athlete.id === athleteId)
          const label = tap.kind === 'split' ? `INTER ${(st?.openSplits.length ?? 0) + 1}` : KIND_LABEL[tap.kind!]
          const detail = tap.kind !== 'start' && st?.openStart !== undefined ? fmtDuration(tap.t - st.openStart) : ''
          return { tap, label, detail }
        }),
    [session, athleteId]
  )

  /** Faux départ / abandon : le départ en cours et ses inters sont annulés. */
  const falseStart = () => {
    if (res.openStart === undefined) return
    const before = session.taps
    const ids = new Set(
      session.taps
        .filter((t) => !t.voided && t.athleteId === athleteId && t.t >= res.openStart! && (t.kind === 'start' || t.kind === 'split'))
        .map((t) => t.id)
    )
    store.restore(session.taps.map((t) => (ids.has(t.id) ? { ...t, voided: true } : t)))
    onDone(`${athlete.name} — départ annulé`, before)
  }

  const change = (tap: Tap, patch: Partial<Tap>, text: string) => {
    const before = session.taps
    store.restore(session.taps.map((t) => (t.id === tap.id ? { ...t, ...patch } : t)))
    setOpenId(null)
    onDone(text, before)
  }

  return (
    <section class="fix" role="dialog" aria-label={`Corriger ${athlete.name}`}>
      <header class="fix-head">
        <div>
          <span class="label">Corriger</span>
          <h2>{athlete.name}</h2>
        </div>
        <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={26} /></button>
      </header>

      <div class="fix-body">
        {res.openStart !== undefined && (
          <button class="btn outline fix-false" onClick={falseStart}>
            <Icon name="undo" size={20} />
            <span>
              Faux départ — annuler le départ
              <small class="mono">parti à {fmtClock(res.openStart)} · il pourra repartir</small>
            </span>
          </button>
        )}

        <span class="label">Passages enregistrés</span>
        {taps.length === 0 && <p class="muted">Aucun passage pour l'instant.</p>}
        <ul class="fix-list">
          {taps.map(({ tap, label, detail }) => {
            const open = openId === tap.id
            return (
              <li key={tap.id} class={open ? 'open' : ''}>
                <button class="fix-row" onClick={() => setOpenId(open ? null : tap.id)}>
                  <span class="kd">{label}</span>
                  <span class="mono clk">{fmtClock(tap.t)}{tap.by && <small class="by"> · {tap.by}</small>}</span>
                  <span class="mono dt">{detail}</span>
                  <Icon name={open ? 'up' : 'down'} size={18} />
                </button>
                {open && (
                  <div class="fix-edit">
                    <span class="label">C'était un</span>
                    <div class={`segment n${kinds.length}`}>
                      {kinds.map((k) => (
                        <button
                          key={k}
                          class={tap.kind === k ? 'on' : ''}
                          onClick={() => k !== tap.kind && change(tap, { kind: k }, `${athlete.name} — corrigé en ${KIND_LABEL[k]}`)}
                        >
                          {KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <span class="label">C'était quelqu'un d'autre</span>
                    <div class="chips">
                      {session.athletes
                        .filter((a) => a.id !== athleteId)
                        .map((a) => (
                          <button key={a.id} class="chip" onClick={() => change(tap, { athleteId: a.id }, `${label} donné à ${a.name}`)}>
                            {a.name}
                          </button>
                        ))}
                    </div>
                    <button class="btn outline" onClick={() => change(tap, { voided: true }, `${athlete.name} — ${label} supprimé`)}>
                      <Icon name="x" size={18} />Supprimer ce passage
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
