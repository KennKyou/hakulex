import type { DiffHunk } from '@hakulex/diff-core'

/** One row of the side-by-side view: what the old and the new version show there. */
export interface DiffRow {
  left: DiffHunk | null
  right: DiffHunk | null
}

/**
 * The side-by-side rows: an equal hunk on both sides, and a
 * run of deletes and inserts paired by position, the shorter side left empty.
 */
export function buildRows(hunks: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  let i = 0
  while (i < hunks.length) {
    const hunk = hunks[i]
    if (hunk.type === 'equal') {
      rows.push({ left: hunk, right: hunk })
      i++
      continue
    }
    const deletes: DiffHunk[] = []
    const inserts: DiffHunk[] = []
    while (i < hunks.length && hunks[i].type !== 'equal') {
      if (hunks[i].type === 'delete')
        deletes.push(hunks[i])
      else
        inserts.push(hunks[i])
      i++
    }
    for (let k = 0; k < Math.max(deletes.length, inserts.length); k++)
      rows.push({ left: deletes[k] ?? null, right: inserts[k] ?? null })
  }
  return rows
}
