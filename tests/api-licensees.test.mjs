import { describe, expect, it } from 'vitest'
import { match } from '../api/licensees.js'

const list = [
  { licence: '328386', nom: 'LE GUENNEC', prenom: 'Loig', club: 'TORCY' },
  { licence: '1', nom: 'GUENNEC', prenom: 'Leo', club: 'X' },
  { licence: '2', nom: 'FONTAINE', prenom: 'Laura', club: 'Y' }
]
const ids = (n, p) => match(list, n, p).map((x) => x.licence)

describe('« Retrouve-toi » via le classement', () => {
  it('nom composé, quel que soit le découpage, accents et tirets ignorés', () => {
    expect(ids('Guennec', 'Loig Le')).toEqual(['328386'])
    expect(ids('Le Guennec', 'Loïg')).toEqual(['328386'])
    expect(ids('le-guennec', 'lo')).toEqual(['328386'])
  })
  it('nom de famille complet exigé, 2 lettres du prénom au moins', () => {
    expect(ids('Font', 'Laura')).toEqual([])
    expect(ids('Fontaine', 'L')).toEqual([])
    expect(ids('Fontaine', 'La')).toEqual(['2'])
  })
})
