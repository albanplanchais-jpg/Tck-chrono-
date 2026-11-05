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
