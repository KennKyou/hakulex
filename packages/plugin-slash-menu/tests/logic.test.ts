import type { SlashMenuItem } from '../src'
import { describe, expect, it } from 'vitest'
import { builtinSlashItems, filterItems, matchTrigger } from '../src'

describe('matchTrigger', () => {
  it.each([
    [
      '/',
      { query: '', length: 1 },
    ],
    [
      '/h1',
      { query: 'h1', length: 3 },
    ],
    [
      'hello /quo',
      { query: 'quo', length: 4 },
    ],
    [
      '／標題',
      { query: '標題', length: 3 },
    ],
    [
      'line\n/x',
      { query: 'x', length: 2 },
    ],
  ])('%j matches', (text, expected) => {
    expect(matchTrigger(text)).toEqual(expected)
  })

  it.each([
    'a/',
    'path/to',
    '/h1 ',
    '//',
    'http://',
    `/${'x'.repeat(33)}`,
  ])('%j does not match', (text) => {
    expect(matchTrigger(text)).toBeNull()
  })
})

describe('filterItems', () => {
  const keys = (items: SlashMenuItem[]) => items.map(item => item.key)

  it('returns everything for an empty query', () => {
    expect(keys(filterItems(builtinSlashItems, ''))).toEqual(keys(builtinSlashItems))
  })

  it('matches keys, titles and keywords case-insensitively', () => {
    expect(keys(filterItems(builtinSlashItems, 'H2'))).toEqual(['h2'])
    expect(keys(filterItems(builtinSlashItems, '標題'))).toEqual(['h1', 'h2', 'h3'])
    expect(keys(filterItems(builtinSlashItems, 'todo'))).toEqual(['check-list'])
  })

  it('ranks prefix matches before substring matches', () => {
    const items: SlashMenuItem[] = [
      {
        key: 'a',
        title: 'Bullet list',
        run: () => {},
      },
      {
        key: 'b',
        title: 'List',
        run: () => {},
      },
    ]
    expect(keys(filterItems(items, 'list'))).toEqual(['b', 'a'])
  })

  it('returns nothing when no item matches', () => {
    expect(filterItems(builtinSlashItems, 'zzz')).toEqual([])
  })
})
