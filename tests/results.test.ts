import { describe, expect, it } from 'vitest'
import { autoKind, computeAthlete, pendingTaps, ranking, stateAt } from '../src/core/results'
import type { Session } from '../src/core/model'
import { fmtDuration } from '../src/core/format'

const A = { id: 'a', name: 'Lucas' }
const B = { id: 'b', name: 'Emma' }
const C = { id: 'c', name: 'Noé' }

const session = (taps: Session['taps'], splits = 0): Session => ({ id: 's', createdAt: 0, athletes: [A, B, C], taps, splits })

describe('results', () => {
  it('associe départ et arrivée suivante, plusieurs passages', () => {
    const r = computeAthlete(A, [
      { id: '1', t: 1000, athleteId: 'a', kind: 'start' },
      { id: '2', t: 61000, athleteId: 'a', kind: 'finish' },
      { id: '3', t: 70000, athleteId: 'a', kind: 'start' },
      { id: '4', t: 125000, athleteId: 'a', kind: 'finish' },
      { id: '5', t: 130000, athleteId: 'a', kind: 'start' }
    ])
    expect(r.runs.map((x) => x.time)).toEqual([60000, 55000])
    expect(r.best).toBe(55000)
    expect(r.openStart).toBe(130000)
  })

  it('ignore les taps annulés et les arrivées orphelines', () => {
    const r = computeAthlete(A, [
      { id: '0', t: 500, athleteId: 'a', kind: 'finish' },
      { id: '1', t: 1000, athleteId: 'a', kind: 'start' },
      { id: '2', t: 2000, athleteId: 'a', kind: 'finish', voided: true },
      { id: '3', t: 5000, athleteId: 'a', kind: 'finish' }
    ])
    expect(r.runs).toHaveLength(1)
    expect(r.best).toBe(4000)
  })

  it('enregistre les inters dans le passage', () => {
    const r = computeAthlete(A, [
      { id: '1', t: 0, athleteId: 'a', kind: 'start' },
      { id: '2', t: 30000, athleteId: 'a', kind: 'split' },
      { id: '3', t: 50000, athleteId: 'a', kind: 'split' },
      { id: '4', t: 70000, athleteId: 'a', kind: 'finish' },
      { id: '5', t: 80000, athleteId: 'a', kind: 'start' },
      { id: '6', t: 90000, athleteId: 'a', kind: 'split' }
    ])
    expect(r.runs[0].splits).toEqual([30000, 50000])
    expect(r.openSplits).toEqual([10000])
  })

  it('propose départ, puis inter, puis arrivée', () => {
    const taps: Session['taps'] = [
      { id: '1', t: 0, athleteId: 'a', kind: 'start' },
      { id: 'x', t: 10000 }
    ]
    const s = session(taps, 1)
    const st = stateAt(s, taps[1])
    expect(autoKind(st[0], 1)).toBe('split')
    expect(autoKind(st[1], 1)).toBe('start')
    taps.splice(1, 0, { id: '2', t: 5000, athleteId: 'a', kind: 'split' })
    expect(autoKind(stateAt(s, taps[2])[0], 1)).toBe('finish')
  })

  it("stateAt ignore le tap lui-même (réattribution d'une arrivée)", () => {
    const taps: Session['taps'] = [
      { id: '1', t: 0, athleteId: 'a', kind: 'start' },
      { id: '2', t: 0, athleteId: 'b', kind: 'start' },
      { id: '3', t: 9000, athleteId: 'a', kind: 'finish' }
    ]
    const st = stateAt(session(taps), taps[2])
    expect(st[0].openStart).toBe(0)
    expect(st[1].openStart).toBe(0)
  })

  it('classe, calcule les écarts, met les non-classés à la fin', () => {
    const s = session([
      { id: '1', t: 0, athleteId: 'a', kind: 'start' },
      { id: '2', t: 0, athleteId: 'b', kind: 'start' },
      { id: '3', t: 50000, athleteId: 'b', kind: 'finish' },
      { id: '4', t: 52340, athleteId: 'a', kind: 'finish' },
      { id: '5', t: 60000 }
    ])
    const r = ranking(s)
    expect(r.map((x) => x.athlete.name)).toEqual(['Emma', 'Lucas', 'Noé'])
    expect(r[1].gap).toBe(2340)
    expect(r[2].rank).toBeUndefined()
    expect(pendingTaps(s)).toHaveLength(1)
  })

  it('ex aequo : même rang', () => {
    const s = session([
      { id: '1', t: 0, athleteId: 'a', kind: 'start' },
      { id: '2', t: 0, athleteId: 'b', kind: 'start' },
      { id: '3', t: 0, athleteId: 'c', kind: 'start' },
      { id: '4', t: 5000, athleteId: 'a', kind: 'finish' },
      { id: '5', t: 5000, athleteId: 'b', kind: 'finish' },
      { id: '6', t: 6000, athleteId: 'c', kind: 'finish' }
    ])
    expect(ranking(s).map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('formate', () => {
    expect(fmtDuration(83456)).toBe('01:23.45')
    expect(fmtDuration(3723456)).toBe('1:02:03.45')
  })
})
