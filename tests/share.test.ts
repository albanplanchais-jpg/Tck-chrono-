import { describe, expect, it } from 'vitest'
import { resultsSheets, resultsText } from '../src/device/share'
import type { Session } from '../src/core/model'

const s: Session = {
  id: 's', createdAt: Date.UTC(2026, 10, 5, 13, 0), title: 'Bassin · 2 × 1 min', comment: 'Beaucoup de vent', splits: 1,
  athletes: [{ id: 'a', name: 'Emma', bib: 3 }, { id: 'b', name: 'Lucas', bib: 7 }],
  taps: [
    { id: '1', t: 0, athleteId: 'a', kind: 'start' }, { id: '2', t: 30000, athleteId: 'a', kind: 'split' }, { id: '3', t: 62000, athleteId: 'a', kind: 'finish' },
    { id: '4', t: 100000, athleteId: 'a', kind: 'start' }, { id: '5', t: 129000, athleteId: 'a', kind: 'split' }, { id: '6', t: 160500, athleteId: 'a', kind: 'finish' },
    { id: '7', t: 0, athleteId: 'b', kind: 'start' }, { id: '8', t: 31000, athleteId: 'b', kind: 'split' }, { id: '9', t: 61000, athleteId: 'b', kind: 'finish' }
  ]
}

describe('partage', () => {
  it('WhatsApp : titre, commentaire, tous les passages', () => {
    const t = resultsText(s)
    expect(t).toContain('*Bassin · 2 × 1 min*')
    expect(t).toContain('_Beaucoup de vent_')
    expect(t).toContain('2. *7 Lucas* — 01:01.00  (+00:00.50)')
    expect(t).toContain('P1 01:02.00 · int1 00:30.00')
    expect(t).toContain('P2 01:00.50 ★ · int1 00:29.00')
  })
  it('Excel : écarts au 1er, à son meilleur et aux inters', () => {
    const [cl, pass, info] = resultsSheets(s)
    expect(cl.rows[0]).toContain('Écart au 1er')
    expect(cl.rows[1].slice(2, 5)).toEqual(['Emma', '01:00.50', '—'])
    expect(cl.rows[2][4]).toBe('+00:00.50')
    const head = pass.rows[0] as string[]
    const emmaP1 = pass.rows.find((r) => r[1] === 'Emma' && r[2] === 1)!
    expect(emmaP1[head.indexOf('Écart au 1er')]).toBe('+00:01.50')
    expect(emmaP1[head.indexOf('Écart à son meilleur')]).toBe('+00:01.50')
    expect(emmaP1[head.indexOf('Écart inter 1')]).toBe('+00:01.00')
    expect(info.rows[2]).toEqual(['Commentaire', 'Beaucoup de vent'])
  })
})
