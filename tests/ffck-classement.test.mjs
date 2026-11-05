import { afterEach, describe, expect, it, vi } from 'vitest'
import { boatOf, findArray, load, splitName, toRow } from '../scripts/ffck-sync/sources/classement.mjs'

describe('source classement descente (exemple fictif)', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.CLASSEMENT_RANKING_URL })

  it('coupe prénom / NOM et déduit l’embarcation', () => {
    expect(splitName('Laura FONTAINE')).toEqual({ prenom: 'Laura', nom: 'FONTAINE' })
    expect(splitName('Jean-Marie DE LA TOUR')).toEqual({ prenom: 'Jean-Marie', nom: 'DE LA TOUR' })
    expect(boatOf('C1D')).toBe('C1')
    expect(boatOf('K1H')).toBe('K1')
  })
  it('ligne sans licence → identifiant stable, points ignorés', () => {
    const a = toRow({ rank: 1, 'Prénom(s) Nom(s)': 'Laura FONTAINE', club: 'C.K. EXEMPLE', category: 'C1D', points: 0, races: 4 })
    const b = toRow({ name: 'Laura FONTAINE', club: 'C.K. Exemple', category: 'C1D' })
    expect(a).toMatchObject({ nom: 'FONTAINE', prenom: 'Laura', club: 'C.K. EXEMPLE', categorie: 'C1D', embarcation: 'C1' })
    expect(a.licence).toMatch(/^CL-[0-9A-F]{12}$/)
    expect(b.licence).toBe(a.licence)
    expect(a).not.toHaveProperty('points')
  })
  it('lit la liste puis chaque classement, sans doublon', async () => {
    process.env.CLASSEMENT_RANKING_URL = 'https://exemple.test/ranking/{id}'
    process.env.FFCK_PAUSE_MS = '0'
    const pages = {
      'https://api.classements-descente.plargentanck.fr/ranking/list': { data: [{ id: 202644, name: 'C1D' }, { id: 202645, name: 'K1H' }] },
      'https://exemple.test/ranking/202644': { ranking: [{ rank: 1, name: 'Laura FONTAINE', club: 'CK Exemple', category: 'C1D' }] },
      'https://exemple.test/ranking/202645': [{ rank: 1, name: 'Hugo MARTINEAU', club: 'Torcy Canoë-Kayak', category: 'K1H' }, { rank: 2, name: 'Laura FONTAINE', club: 'CK Exemple', category: 'C1D' }]
    }
    vi.stubGlobal('fetch', async (url) => new Response(JSON.stringify(pages[url]), { status: 200, headers: { 'content-type': 'application/json' } }))
    const { list } = await load()
    expect(list.map((l) => `${l.prenom} ${l.nom} · ${l.club} · ${l.embarcation}`)).toEqual(['Laura FONTAINE · CK Exemple · C1', 'Hugo MARTINEAU · Torcy Canoë-Kayak · K1'])
  })
  it('structure inattendue → erreur claire', async () => {
    process.env.CLASSEMENT_RANKING_URL = 'https://exemple.test/ranking/{id}'
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'maintenance' }), { status: 200 }))
    await expect(load()).rejects.toThrow(/Liste des classements introuvable/)
  })
})
