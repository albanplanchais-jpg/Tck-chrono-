import { useMemo, useState } from 'preact/hooks'
import { KIND_LABEL, type Session, type Tap } from '../core/model'
import { stateAt } from '../core/results'
import { fmtClock, fmtDuration } from '../core/format'
import type { Store } from '../store/useSession'
import { AssignSheet } from './AssignSheet'
import { Icon } from './Icon'

/** Journal de tous les taps : permet de réattribuer (ex. après une arrivée groupée). */
export function TapLog({ store, session, onClose }: { store: Store; session: Session; onClose: () => void }) {
  const [editId, setEditId] = useState<string | null>(null)
  const names = useMemo(() => new Map(session.athletes.map((a) => [a.id, a.name])), [session.athletes])

  const rows = useMemo(() => {
    const taps = session.taps.filter((t) => !t.voided).sort((a, b) => b.t - a.t)
    const count = new Map<number, number>()
    taps.forEach((t) => count.set(t.t, (count.get(t.t) ?? 0) + 1))
    return taps.map((tap) => {
      let label = 'À attribuer'
      let detail = ''
      if (tap.athleteId && tap.kind) {
        const r = stateAt(session, tap).find((x) => x.athlete.id === tap.athleteId)
        const open = r?.openStart
        if (tap.kind === 'split') label = `INTER ${(r?.openSplits.length ?? 0) + 1}`
        else label = KIND_LABEL[tap.kind]
        if (tap.kind !== 'start') detail = open !== undefined ? fmtDuration(tap.t - open) : 'sans départ'
      }
      return { tap, label, detail, grouped: (count.get(tap.t) ?? 0) > 1 }
    })
  }, [session])

  const editing = editId ? session.taps.find((t) => t.id === editId) : undefined

  return (
    <div class="layer">
      <header class="px layer-head">
        <div>
          <span class="label">{rows.length} tap{rows.length > 1 ? 's' : ''}</span>
          <h2>Journal</h2>
        </div>
        <button class="rm" onClick={onClose} aria-label="Fermer le journal"><Icon name="x" size={26} /></button>
      </header>
      <p class="px layer-hint">Touchez une ligne pour changer l'athlète ou le type. Les taps groupés ont le même temps.</p>

      <ul class="scroll log">
        {rows.length === 0 && <li class="none">Aucun tap pour l'instant</li>}
        {rows.map(({ tap, label, detail, grouped }) => (
          <li key={tap.id}>
            <button class={`log-row ${grouped ? 'grouped' : ''} ${tap.athleteId ? '' : 'todo'}`} onClick={() => setEditId(tap.id)}>
              <span class="mono clk">{fmtClock(tap.t)}</span>
              <span class="nm">
                {tap.athleteId ? names.get(tap.athleteId) : '—'}
                {tap.by && <small class="by">par {tap.by}</small>}
              </span>
              <span class="kd">{label}</span>
              <span class="mono dt">{detail}</span>
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <>
          <div class="scrim" onClick={() => setEditId(null)} />
          <AssignSheet
            session={session}
            tap={editing}
            mode="edit"
            onAssign={(items) => { store.assignMany(editing.id, items); setEditId(null) }}
            onVoid={() => { store.voidTap(editing.id); setEditId(null) }}
            onClose={() => setEditId(null)}
          />
        </>
      )}
    </div>
  )
}

export type { Tap }
