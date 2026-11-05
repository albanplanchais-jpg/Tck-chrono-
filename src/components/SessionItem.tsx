import type { SessionSummary } from '../core/stats'
import { fmtDuration, fmtHM } from '../core/format'
import { Icon } from './Icon'

const MONTHS = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']

/** Ligne « séance » : case date, titre, athlètes · passages, meilleur temps. */
export function SessionItem({ sum, course, onOpen }: { sum: SessionSummary; course?: string; onOpen: () => void }) {
  const s = sum.session
  const d = new Date(s.createdAt)
  return (
    <li>
      <button class="sess" onClick={onOpen}>
        <span class="datebox">
          <b class="mono">{String(d.getDate()).padStart(2, '0')}</b>
          <small>{MONTHS[d.getMonth()]}</small>
        </span>
        <span class="sess-main">
          <b>{s.title || `Séance · ${fmtHM(s.createdAt)}`}</b>
          <small>
            {course && course !== s.title && <span class="course-tag"><Icon name="flag" size={11} stroke={2.6} />{course}</span>}
            {sum.athletes} athlète{sum.athletes > 1 ? 's' : ''} · {sum.passages} passage{sum.passages > 1 ? 's' : ''}
            {!s.endedAt && ' · en cours'}
          </small>
          {s.comment && <i class="sess-comment">« {s.comment} »</i>}
        </span>
        <span class="sess-best">
          {sum.best ? (
            <>
              <b class="mono">{fmtDuration(sum.best.time)}</b>
              <small>{sum.best.name}</small>
            </>
          ) : (
            <small>—</small>
          )}
        </span>
        <Icon name="right" size={18} />
      </button>
    </li>
  )
}
