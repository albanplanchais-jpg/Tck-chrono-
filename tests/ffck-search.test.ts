import { describe, expect, it } from 'vitest'
import { buildIndex, clubKeys, search, type Licensee } from '../src/ffck/search'

const L = (licence: string, nom: string, prenom: string, club: string, active = true): Licensee => ({ licence, nom, prenom, club, active })
const idx = buildIndex([
  L('1', 'LEFÈVRE', 'Éloïse', 'Torcy Canoë-Kayak'),
  L('2', 'LEFEBVRE', 'Hugo', 'Canoë-Kayak Club de Meaux'),
  L('3', 'MARTIN', 'Emma', 'Torcy Canoë-Kayak'),
  L('4', 'MARTINEZ', 'Emma', 'Vaires Eaux Vives'),
  L('5', 'MARTIN', 'Emma', 'Torcy Canoë-Kayak', false),
  L('6', 'DUPONT', 'Lucas', 'Club Nautique de Lagny')
])
const names = (h: ReturnType<typeof search>) => h.map((x) => `${x.l.prenom} ${x.l.nom}`)

describe('recherche licenciés', () => {
  it('sans accents ni casse, par début de mot', () => {
    expect(names(search(idx, 'lefev'))[0]).toBe('Éloïse LEFÈVRE') // LEFEBVRE suit (1 faute tolérée)
    expect(names(search(idx, 'ELOISE'))).toEqual(['Éloïse LEFÈVRE'])
  })
  it('nom + prénom dans n’importe quel ordre', () => {
    expect(names(search(idx, 'emma martin', { myClub: 'Torcy Canoë-Kayak' }))[0]).toBe('Emma MARTIN')
  })
  it('tolère une petite faute de frappe', () => {
    expect(names(search(idx, 'dupnot'))).toEqual(['Lucas DUPONT'])
    expect(names(search(idx, 'lefebrve'))).toContain('Hugo LEFEBVRE')
  })
  it('recherche par club', () => {
    expect(names(search(idx, 'lagny'))).toEqual(['Lucas DUPONT'])
  })
  it('« Mon club » : Torcy seulement, actifs devant', () => {
    const h = search(idx, 'emma', { myClub: 'Torcy Canoë-Kayak', onlyMyClub: true })
    expect(h.map((x) => x.l.licence)).toEqual(['3', '5'])
    expect(search(idx, 'emma', { myClub: 'Torcy Canoë-Kayak' })[0].l.licence).toBe('3')
  })
  it('clés de club', () => {
    expect(clubKeys('Torcy Canoë-Kayak')).toEqual(['torcy'])
  })
  it('rapide sur 50 000 licenciés', () => {
    const big = buildIndex(Array.from({ length: 50000 }, (_, i) => L(String(i), `NOM${i}`, `Prenom${i % 900}`, i % 10 ? 'Autre club' : 'Torcy Canoë-Kayak')))
    const t = performance.now()
    search(big, 'prenom12 nom', { myClub: 'Torcy' })
    expect(performance.now() - t).toBeLessThan(150)
  })
})
