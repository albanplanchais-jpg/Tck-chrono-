import { describe, expect, it } from 'vitest'
import { moveWave, moveWaveTo, parseBib, sortByBib, startAlone, startWith, waveNumbers, waves } from '../src/core/startOrder'
import type { Athlete } from '../src/core/model'

const L = (...xs: [string, number?][]): Athlete[] => xs.map(([id, bib]) => ({ id, name: id, bib }))
const ids = (l: Athlete[]) => waves(l).map((g) => g.map((a) => a.id).join('+')).join(' | ')

describe('ordre de départ', () => {
  it('le 10 part avec le 3', () => {
    let l = L(['a', 3], ['b', 7], ['c', 10], ['d', 1])
    l = startWith(l, 'c', 'a')
    expect(ids(l)).toBe('a+c | b | d')
    expect(waveNumbers(l).get('c')).toBe(1)
  })
  it('déplace une vague entière', () => {
    let l = startWith(L(['a'], ['b'], ['c']), 'c', 'a') // a+c | b
    l = moveWave(l, 'c', 1)
    expect(ids(l)).toBe('b | a+c')
    expect(moveWave(l, 'b', -1)).toBe(l)
  })
  it('glisse une vague à une autre place', () => {
    const l = startWith(L(['a'], ['b'], ['c'], ['d']), 'b', 'a') // a+b | c | d
    expect(ids(moveWaveTo(l, 'b', 2))).toBe('c | d | a+b')
    expect(ids(moveWaveTo(l, 'd', 0))).toBe('d | a+b | c')
    expect(moveWaveTo(l, 'c', 1)).toBe(l)
  })
  it('sort un athlète de sa vague', () => {
    const l = startAlone(startWith(L(['a'], ['b'], ['c']), 'c', 'a'), 'a')
    expect(ids(l)).toBe('c | a | b')
  })
  it('trie par dossard, sans dossard à la fin', () => {
    const l = sortByBib(startWith(L(['a', 12], ['b'], ['c', 3], ['d', 7]), 'd', 'a'))
    expect(ids(l)).toBe('c | d | a | b')
  })
  it('lit un dossard', () => {
    expect(parseBib('12')).toBe(12)
    expect(parseBib(' n°7 ')).toBe(7)
    expect(parseBib('')).toBeUndefined()
  })
})
