import { useMemo, useState } from 'preact/hooks'
import { uid, type Athlete, type Course, type Session } from '../core/model'
import { courseStats, summarize } from '../core/stats'
import { fmtDay, fmtDuration } from '../core/format'
import { SessionItem } from '../components/SessionItem'
import { Icon } from '../components/Icon'

interface Props {
  courses: Course[]
  sessions: Session[]
  group: Athlete[]
  onSave: (c: Course) => void
  onDelete: (id: string) => void
  onStartOn: (c: Course) => void
  onOpenSession: (s: Session) => void
  /** Une séance est déjà en cours : on ne peut pas en lancer une autre. */
  busy?: boolean
}

export const courseInfo = (c: Course) =>
  [c.distance ? (c.distance >= 1000 ? `${(c.distance / 1000).toLocaleString('fr-FR')} km` : `${c.distance} m`) : null, c.splits ? `${c.splits} inter${c.splits > 1 ? 's' : ''}` : null]
    .filter(Boolean)
    .join(' · ')

/** Mes parcours : parcours de référence, avec record et classement des meilleurs temps. */
export function Courses({ courses, sessions, group, onSave, onDelete, onStartOn, onOpenSession, busy }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<Course | 'new' | null>(null)
  const stats = useMemo(() => new Map(courses.map((c) => [c.id, courseStats(c.id, sessions, group)])), [courses, sessions, group])
  const current = courses.find((c) => c.id === open)

  return (
    <div class="screen tabbed">
      <div class="scroll px">
        <header class="page-head">
          <div>
            <span class="label">Mes parcours</span>
            <h1>Parcours</h1>
          </div>
          <button class="icon-btn" onClick={() => setForm('new')} aria-label="Nouveau parcours"><Icon name="plus" size={20} stroke={2.6} /></button>
        </header>

        {!courses.length ? (
          <div class="empty-state">
            <div class="ico"><Icon name="flag" size={24} stroke={1.8} /></div>
            <h3>Aucun parcours</h3>
            <p>Crée tes parcours de base (bassin, rivière, slalom…) : chaque séance faite dessus alimente le classement et le record du parcours.</p>
            <button class="btn primary" style={{ marginTop: 18 }} onClick={() => setForm('new')}><Icon name="plus" size={20} />Créer un parcours</button>
          </div>
        ) : (
          <ul class="courses">
            {courses.map((c) => {
              const st = stats.get(c.id)!
              return (
                <li key={c.id}>
                  <button class="course" onClick={() => setOpen(c.id)}>
                    <span class="c-main">
                      <b>{c.name}</b>
                      <small>{[courseInfo(c), `${st.sessions.length} séance${st.sessions.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span class="c-rec">
                      {st.record ? (
                        <>
                          <small>Record</small>
                          <b class="mono">{fmtDuration(st.record.best)}</b>
                          <small>{st.record.athlete.name}</small>
                        </>
                      ) : (
                        <small>Pas encore de temps</small>
                      )}
                    </span>
                    <Icon name="right" size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {courses.length > 0 && (
          <button class="soft-btn" onClick={() => setForm('new')}><Icon name="plus" size={18} stroke={2.6} />Nouveau parcours</button>
        )}
        <div style={{ height: 24 }} />
      </div>

      {current && (
        <CoursePage
          course={current}
          st={stats.get(current.id)!}
          busy={busy}
          onClose={() => setOpen(null)}
          onStart={() => onStartOn(current)}
          onEdit={() => setForm(current)}
          onDelete={() => { onDelete(current.id); setOpen(null) }}
          onOpenSession={onOpenSession}
        />
      )}
      {form && (
        <CourseForm
          course={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSave={(c) => { onSave(c); setForm(null) }}
        />
      )}
    </div>
  )
}

function CoursePage({ course, st, busy, onClose, onStart, onEdit, onDelete, onOpenSession }: {
  course: Course
  st: ReturnType<typeof courseStats>
  busy?: boolean
  onClose: () => void
  onStart: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenSession: (s: Session) => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div class="layer">
      <header class="px layer-head">
        <div style={{ minWidth: 0 }}>
          <span class="label">Parcours{courseInfo(course) ? ` · ${courseInfo(course)}` : ''}</span>
          <h2>{course.name}</h2>
        </div>
        <button class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={26} /></button>
      </header>
      <div class="scroll px">
        {course.notes && <p class="res-comment" style={{ marginTop: 0 }}>{course.notes}</p>}
        <div class="statbox">
          <div><b class="mono">{st.record ? fmtDuration(st.record.best) : '—'}</b><span>Record</span></div>
          <div><b class="mono">{st.sessions.length}</b><span>Séances</span></div>
          <div><b class="mono">{st.board.length}</b><span>Athlètes</span></div>
        </div>
        <button class="btn primary" style={{ marginTop: 14 }} disabled={busy} onClick={onStart}>
          <Icon name="play" size={18} />Lancer une séance ici
        </button>
        {busy && <p class="note" style={{ marginTop: 8 }}>Une séance est déjà en cours.</p>}

        <div class="sec-head"><h2>Meilleurs temps</h2><span class="label">{st.board.length} athlète{st.board.length > 1 ? 's' : ''}</span></div>
        {!st.board.length && <p class="muted">Lance une séance sur ce parcours pour remplir le classement.</p>}
        <ol class="lboard">
          {st.board.map((e, i) => (
            <li key={e.athlete.id} class={i === 0 ? 'first' : ''}>
              <button onClick={() => onOpenSession(e.session)}>
                <span class="rk">{i + 1}</span>
                <span class="g-name">
                  <b>{e.athlete.bib !== undefined && <span class="bibn mono">{e.athlete.bib}</span>}{e.athlete.name}</b>
                  <small>{fmtDay(e.session.createdAt)} · {e.runs} passage{e.runs > 1 ? 's' : ''}</small>
                </span>
                <span class="g-time mono">
                  {fmtDuration(e.best)}
                  {i > 0 && <small class="gap mono">+{fmtDuration(e.best - st.board[0].best)}</small>}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div class="sec-head"><h2>Séances</h2></div>
        {!st.sessions.length && <p class="muted">Aucune séance sur ce parcours.</p>}
        <ul class="sess-list">
          {st.sessions.map((s) => <SessionItem key={s.id} sum={summarize(s)} onOpen={() => onOpenSession(s)} />)}
        </ul>

        <div class="row2" style={{ marginTop: 22 }}>
          <button class="btn outline" onClick={onEdit}>Modifier</button>
          <button class="btn outline" onClick={() => setConfirm(true)}>Supprimer</button>
        </div>
        {confirm && (
          <div class="danger">
            <p>Supprimer le parcours « {course.name} » ? Les séances restent dans l'historique.</p>
            <div class="row2">
              <button class="btn outline" onClick={() => setConfirm(false)}>Garder</button>
              <button class="btn primary" onClick={onDelete}>Supprimer</button>
            </div>
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>
    </div>
  )
}

function CourseForm({ course, onClose, onSave }: { course?: Course; onClose: () => void; onSave: (c: Course) => void }) {
  const [name, setName] = useState(course?.name ?? '')
  const [distance, setDistance] = useState(course?.distance ? String(course.distance) : '')
  const [splits, setSplits] = useState(course?.splits ?? 0)
  const [notes, setNotes] = useState(course?.notes ?? '')
  const submit = (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const d = parseInt(distance.replace(/\D/g, ''), 10)
    onSave({
      id: course?.id ?? uid(),
      name: n.slice(0, 60),
      ...(Number.isFinite(d) && d > 0 ? { distance: d } : {}),
      ...(splits ? { splits } : {}),
      ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {})
    })
  }
  return (
    <div class="modal-wrap" onClick={onClose}>
      <form class="modal login-form info" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div class="share-head">
          <h2>{course ? 'Modifier le parcours' : 'Nouveau parcours'}</h2>
          <button type="button" class="rm" onClick={onClose} aria-label="Fermer"><Icon name="x" size={24} /></button>
        </div>
        <label>
          <span class="label">Nom du parcours</span>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Bassin 500 m, Rivière Torcy…" maxLength={60} required />
        </label>
        <label>
          <span class="label">Distance en mètres · facultatif</span>
          <input value={distance} onInput={(e) => setDistance((e.target as HTMLInputElement).value)} placeholder="500" inputMode="numeric" />
        </label>
        <div class="opt">
          <span class="label white">Inters</span>
          <div class="seg-sm" role="group" aria-label="Nombre d'inters sur ce parcours">
            {[0, 1, 2, 3].map((n) => (
              <button type="button" key={n} class={splits === n ? 'on' : ''} aria-pressed={splits === n} onClick={() => setSplits(n)}>{n === 0 ? 'Non' : n}</button>
            ))}
          </div>
        </div>
        <label>
          <span class="label">Notes · facultatif</span>
          <textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="Départ au ponton, arrivée à la bouée…" rows={3} maxLength={300} />
        </label>
        <button class="btn primary" type="submit">{course ? 'Enregistrer' : 'Créer le parcours'}</button>
      </form>
    </div>
  )
}
