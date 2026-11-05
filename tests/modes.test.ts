import { describe, expect, it } from 'vitest'
import { fmtOffset, pursuitPlan, schedule } from '../src/core/modes'
import { ranking } from '../src/core/results'
import type { Session } from '../src/core/model'

const src: Session = {
  id: 'src', createdAt: 0,
  athletes: [{ id: 'a', name: 'Emma' }, { id: 'b', name: 'Lucas' }, { id: 'c', name: 'Hugo' }, { id: 'd', name: 'Léa' }],
  taps: [
    { id: '1', t: 0, athleteId: 'a', kind: 'start' }, { id: '2', t: 60000, athleteId: 'a', kind: 'finish' },
    { id: '3', t: 0, athleteId: 'b', kind: 'start' }, { id: '4', t: 72500, athleteId: 'b', kind: 'finish' },
    { id: '5', t: 0, athleteId: 'c', kind: 'start' }, { id: '6', t: 65000, athleteId: 'c', kind: 'finish' }
  ]
}

describe('poursuite', () => {
  it('le plus lent part en premier, décalage = avance sur le plus lent', () => {
    const { entries, without } = pursuitPlan(src)
    expect(entries.map((e) => [e.athlete.name, e.offset])).toEqual([['Lucas', 0], ['Hugo', 7500], ['Emma', 12500]])
    expect(without.map((a) => a.name)).toEqual(['Léa'])
    expect(fmtOffset(12500)).toBe('+0:12.5')
    expect(fmtOffset(0)).toBe('0:00.0')
  })
  it('départs programmés et classement à l’arrivée', () => {
    const { entries } = pursuitPlan(src)
    const s: Session = {
      id: 'p', createdAt: 0, mode: 'pursuit', athletes: entries.map((e) => e.athlete),
      pursuit: { offsets: Object.fromEntries(entries.map((e) => [e.athlete.id, e.offset])), refs: {} }, taps: []
    }
    expect(schedule(s, 1000).map((x) => [x.athleteId, x.t])).toEqual([['b', 1000], ['c', 8500], ['a', 13500]])
    s.taps = [
      ...schedule(s, 0).map((x, i) => ({ id: `s${i}`, t: x.t, athleteId: x.athleteId, kind: 'start' as const })),
      { id: 'f1', t: 74000, athleteId: 'a', kind: 'finish' }, // Emma : 61,5 s de course, arrive 2e
      { id: 'f2', t: 73000, athleteId: 'c', kind: 'finish' }, // Hugo : arrive 1er
      { id: 'f3', t: 76000, athleteId: 'b', kind: 'finish' }
    ]
    const r = ranking(s)
    expect(r.map((x) => [x.athlete.name, x.rank, x.gap])).toEqual([['Hugo', 1, 0], ['Emma', 2, 1000], ['Lucas', 3, 3000]])
    expect(r[1].best).toBe(61500)
  })
  it('mass start : tout le monde au même instant', () => {
    const s: Session = { id: 'm', createdAt: 0, mode: 'mass', athletes: src.athletes, taps: [] }
    expect(new Set(schedule(s, 500).map((x) => x.t))).toEqual(new Set([500]))
  })
})
