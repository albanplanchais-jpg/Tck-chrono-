import { afterEach, describe, expect, it, vi } from 'vitest'
import { boatOf, findArray, load, splitName, toRow, toRows } from '../scripts/ffck-sync/sources/classement.mjs'

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
  it('format réel : licence tirée de code_bateau, biplace coupé en deux', () => {
    expect(toRows({ code_bateau: 'C1D264765', code_epreuve: 'C1DU15', nom_prenom: 'Laura FONTAINE', club: 'CK EXEMPLE', numero_club: '6803', points: 0, rang: 1 }))
      .toEqual([{ licence: '264765', nom: 'FONTAINE', prenom: 'Laura', club: 'CK EXEMPLE', categorie: 'C1DU15', embarcation: 'C1' }])
    const two = toRows({ code_bateau: 'C2D323482351422', code_epreuve: 'C2D', nom_prenom: 'Marine ROULAND/Carole HUIBAN', club: 'CK A/CK B' })
    expect(two.map((x) => `${x.licence} ${x.prenom} ${x.nom} ${x.club} ${x.embarcation}`)).toEqual(['323482 Marine ROULAND CK A C2', '351422 Carole HUIBAN CK B C2'])
  })
  it('lit la dernière édition page par page, sans doublon', async () => {
    process.env.FFCK_PAUSE_MS = '0'
    const B = 'https://api.classements-descente.plargentanck.fr'
    const seen = []
    const page1 = Array.from({ length: 500 }, (_, i) => ({ code_bateau: `K1H${100000 + i}`, code_epreuve: 'K1H', nom_prenom: `Athlete${i} NOM`, club: 'CK' }))
    const page2 = [{ code_bateau: 'K1H100000', code_epreuve: 'K1HU18', nom_prenom: 'Athlete0 NOM', club: 'CK' }, { code_bateau: 'C1D264765', code_epreuve: 'C1D', nom_prenom: 'Laura FONTAINE', club: 'CK Exemple' }]
    vi.stubGlobal('fetch', async (url) => {
      seen.push(url)
      const body = url === `${B}/ranking/list` ? [{ code_clt: 'DES_NUM', code_liste: 302643, libelle: 'Ancien :' }, { code_clt: 'DES_NUM', code_liste: 302644, libelle: 'Classement DES_NUM : 2026/10/31 :' }]
        : url === `${B}/ranking/302644?limit=500&offset=0` ? page1
        : url === `${B}/ranking/302644?limit=500&offset=500` ? page2 : null
      return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
    })
    const { list, label } = await load()
    expect(seen).not.toContain(`${B}/ranking/302643?limit=500&offset=0`)
    expect(list).toHaveLength(501)
    expect(list.find((l) => l.licence === '264765')).toMatchObject({ prenom: 'Laura', nom: 'FONTAINE', embarcation: 'C1' })
    expect(label).toContain('302644')
  })
  it('structure inattendue → erreur claire', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'maintenance' }), { status: 200 }))
    await expect(load()).rejects.toThrow(/Liste des classements introuvable/)
  })
})
