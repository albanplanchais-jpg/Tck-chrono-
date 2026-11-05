import { describe, expect, it } from 'vitest'
import { parseCsv } from '../scripts/ffck-sync/lib/csv.mjs'
import { fromTable, fromObjects, mapColumns } from '../scripts/ffck-sync/lib/normalize.mjs'
import { diff } from '../scripts/ffck-sync/lib/diff.mjs'

describe('synchro FFCK', () => {
  it('lit un CSV « ; » avec guillemets et BOM', () => {
    const { header, rows } = parseCsv('﻿N° Licence;Nom;Prénom;Club\n"123456";"DUPONT; fils";jean-marie;Torcy\n\n')
    expect(header).toEqual(['N° Licence', 'Nom', 'Prénom', 'Club'])
    expect(rows).toEqual([['123456', 'DUPONT; fils', 'jean-marie', 'Torcy']])
  })
  it('ne garde que les champs autorisés et normalise', () => {
    const { list } = fromTable(['Numéro de licence', 'NOM', 'prénom', 'Club', 'Téléphone', 'Date de naissance'], [['12 34 56', 'dupont', 'JEAN-MARIE', ' Torcy  CK ', '0600', '2010-01-01']])
    expect(list).toEqual([{ licence: '123456', nom: 'DUPONT', prenom: 'Jean-Marie', club: 'Torcy CK', categorie: null, embarcation: null }])
  })
  it('arrête tout si la structure change (colonne requise absente)', () => {
    expect(() => mapColumns(['Licence', 'Nom', 'Club'])).toThrow(/prenom/)
  })
  it('API : objets JSON avec d’autres noms de champs', () => {
    const { list } = fromObjects([{ license_number: 'A123', lastName: 'Martin', firstName: 'léa', club: 'Torcy', discipline: 'K1', email: 'x@y' }])
    expect(list[0]).toMatchObject({ licence: 'A123', nom: 'MARTIN', prenom: 'Léa', embarcation: 'K1' })
    expect(list[0]).not.toHaveProperty('email')
  })
  it('diff : ajout, modification, désactivation, réactivation, opposition', () => {
    const base = { categorie: 'U15', embarcation: 'K1', first_seen: 't0', updated_at: 't0', inactive_since: null }
    const prev = new Map([
      ['1', { licence: '1', nom: 'A', prenom: 'a', club: 'Torcy', active: true, ...base }],
      ['2', { licence: '2', nom: 'B', prenom: 'b', club: 'Torcy', active: true, ...base }],
      ['3', { licence: '3', nom: 'C', prenom: 'c', club: 'Torcy', active: false, ...base, inactive_since: 't0' }],
      ['4', { licence: '4', nom: 'D', prenom: 'd', club: 'Torcy', active: true, ...base }]
    ])
    const today = [
      { licence: '1', nom: 'A', prenom: 'a', club: 'Meaux', categorie: 'U15', embarcation: 'K1' }, // modifié (club)
      { licence: '3', nom: 'C', prenom: 'c', club: 'Torcy', categorie: 'U15', embarcation: 'K1' }, // réactivé
      { licence: '4', nom: 'D', prenom: 'd', club: 'Torcy', categorie: 'U15', embarcation: 'K1' }, // en opposition
      { licence: '5', nom: 'E', prenom: 'e', club: 'Torcy', categorie: 'U13', embarcation: 'C1' } // nouveau
    ]
    const d = diff(prev, today, new Set(['4']), 't1')
    expect(d.added.map((r) => r.licence)).toEqual(['5'])
    expect(d.modified.map((r) => r.licence)).toEqual(['1'])
    expect(d.reactivated.map((r) => r.licence)).toEqual(['3'])
    expect(d.deactivated.map((r) => [r.licence, r.active, r.inactive_since])).toEqual([['2', false, 't1']])
    expect(d.removed).toEqual(['4'])
    expect(d.next.has('4')).toBe(false)
    expect(d.next.get('2')).toBeTruthy() // désactivé, pas supprimé
  })
})
