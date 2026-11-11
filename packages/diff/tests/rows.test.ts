import type { DiffHunk } from '@hakulex/diff-core'
import { describe, expect, it } from 'vitest'
import { buildRows } from '../src/rows'

function hunk(type: DiffHunk['type'], id: string): DiffHunk {
  return {
    type,
    nodes: [
      { type: 'paragraph', version: 1, id } as never,
    ],
  }
}
function shape(hunks: DiffHunk[]) {
  return buildRows(hunks).map(({ left, right }) => [
    left
      ? `${left.type}:${(left.nodes[0] as unknown as { id: string }).id}`
      : '-',
    right
      ? `${right.type}:${(right.nodes[0] as unknown as { id: string }).id}`
      : '-',
  ])
}

describe('buildRows', () => {
  it('puts equal hunks on both sides and pairs runs of deletes and inserts by position', () => {
    expect(shape([
      hunk('equal', 'a'),
      hunk('delete', 'b'),
      hunk('insert', 'b2'),
      hunk('delete', 'c'),
      hunk('equal', 'd'),
      hunk('insert', 'e'),
    ])).toEqual([
      ['equal:a', 'equal:a'],
      ['delete:b', 'insert:b2'],
      ['delete:c', '-'],
      ['equal:d', 'equal:d'],
      ['-', 'insert:e'],
    ])
  })

  it('leaves the shorter side empty when a run has more on one side', () => {
    expect(shape([
      hunk('insert', 'x'),
      hunk('insert', 'y'),
      hunk('delete', 'z'),
    ])).toEqual([
      ['delete:z', 'insert:x'],
      ['-', 'insert:y'],
    ])
  })
})
