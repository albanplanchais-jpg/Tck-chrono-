import { describe, expect, it } from 'vitest'
import { athleteStats, summarize, totals } from '../src/core/stats'
import { fmtDuration } from '../src/core/format'
import type { Session } from '../src/core/model'

const s1: Session = {
  id: 's1', createdAt: 1000, title: 'Bassin', athletes: [{ id: 'a', name: 'Emma' }, { id: 'b', name: 'Lucas' }],
  taps: [
    { id: '1', t: 0, athleteId: 'a', kind: 'start' }, { id: '2', t: 61890, athleteId: 'a', kind: 'finish' },
    { id: '3', t: 0, athleteId: 'b', kind: 'start' }, { id: '4', t: 62370, athleteId: 'b', kind: 'finish' }
  ]
}
const s2: Session = {
  id: 's2', createdAt: 2000, athletes: [{ id: 'zz', name: 'emma' }],
  taps: [{ id: '5', t: 0, athleteId: 'zz', kind: 'start' }, { id: '6', t: 61950, athleteId: 'zz', kind: 'finish' }]
}

describe('stats', () => {
  it('résume une séance', () => {
    const r = summarize(s1)
    expect(r.passages).toBe(2)
    expect(r.best).toEqual({ time: 61890, name: 'Emma' })
  })
  it('stats par athlète (même id ou même nom)', () => {
    const st = athleteStats([{ id: 'b', name: 'Lucas' }, { id: 'a', name: 'Emma' }, { id: 'c', name: 'Noé' }], [s1, s2])
    expect(st.map((x) => x.athlete.name)).toEqual(['Emma', 'Lucas', 'Noé'])
    expect(st[0].sessions).toBe(2)
    expect(st[0].best).toBe(61890)
    expect(st[0].history[0].session.id).toBe('s2')
    expect(st[2].best).toBeUndefined()
  })
  it('totaux', () => {
    expect(totals([s1, s2], [{ id: 'a', name: 'Emma' }])).toEqual({ sessions: 2, athletes: 1, passages: 3 })
  })
  it('précision dixième', () => {
    expect(fmtDuration(61890, 1)).toBe('01:01.8')
    expect(fmtDuration(61890)).toBe('01:01.89')
  })
})

import { athleteCourseBests, courseStats } from '../src/core/stats'

describe('parcours', () => {
  const mk = (id: string, created: number, course: string | undefined, times: [string, string, number][]): Session => ({
    id, createdAt: created, courseId: course,
    athletes: times.map(([aid, name]) => ({ id: aid, name })),
    taps: times.flatMap(([aid, , t], i) => [
      { id: `${id}${i}s`, t: 0, athleteId: aid, kind: 'start' as const },
      { id: `${id}${i}f`, t, athleteId: aid, kind: 'finish' as const }
    ])
  })
  const sessions = [
    mk('x1', 1, 'bassin', [['a', 'Emma', 62000], ['b', 'Lucas', 61000]]),
    mk('x2', 2, 'bassin', [['a2', 'emma', 60500]]),
    mk('x3', 3, 'riviere', [['a', 'Emma', 250000]]),
    mk('x4', 4, undefined, [['a', 'Emma', 1000]])
  ]
  it('classement et record du parcours (même athlète par nom)', () => {
    const st = courseStats('bassin', sessions, [{ id: 'a', name: 'Emma' }])
    expect(st.sessions.map((s) => s.id)).toEqual(['x2', 'x1'])
    expect(st.board.map((e) => [e.athlete.name, e.best])).toEqual([['Emma', 60500], ['Lucas', 61000]])
    expect(st.record?.session.id).toBe('x2')
    expect(st.board[0].runs).toBe(2)
  })
  it('records d’un athlète par parcours', () => {
    const r = athleteCourseBests({ id: 'a', name: 'Emma' }, [{ id: 'bassin', name: 'Bassin' }, { id: 'riviere', name: 'Rivière' }, { id: 'vide', name: 'Vide' }], sessions)
    expect(r.map((x) => [x.course.name, x.best, x.rank, x.of])).toEqual([['Bassin', 60500, 1, 2], ['Rivière', 250000, 1, 1]])
  })
})
