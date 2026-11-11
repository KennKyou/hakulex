/**
 * A chart spec as the form edits it: plain data, with every field the form doesn't manage
 * kept. These functions don't touch the page; the dialog calls them and shows the result.
 */
export type ChartDraft = Record<string, unknown>
type Row = Record<string, unknown>
interface Series { key: string, label?: string, color?: number }

const MAX_SERIES = 6
const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
function rowsOf(draft: ChartDraft): Row[] {
  return Array.isArray(draft.data)
    ? draft.data.filter(isObject)
    : []
}
function seriesOf(draft: ChartDraft): Series[] {
  return Array.isArray(draft.series)
    ? draft.series.filter((item): item is Series => isObject(item) && typeof item.key === 'string')
    : []
}

/** A JSON object, or `null` for anything else: then only the JSON tab can edit it. */
export function parseChartDraft(source: string): ChartDraft | null {
  try {
    const parsed: unknown = JSON.parse(source)
    return isObject(parsed)
      ? parsed
      : null
  }
  catch {
    return null
  }
}

export function serializeChartDraft(draft: ChartDraft): string {
  return JSON.stringify(draft, null, 2)
}

const blank = (value: unknown) => value === undefined || value === null || value === ''

/** Sets fields; blank ones leave the spec. */
export function patchDraft(draft: ChartDraft, patch: Record<string, unknown>): ChartDraft {
  const next = { ...draft }
  for (const [key, value] of Object.entries(patch)) {
    if (blank(value))
      delete next[key]
    else
      next[key] = value
  }
  return next
}

/** Sets fields of `format` or `y`; an object left empty leaves the spec. */
export function patchNested(draft: ChartDraft, key: 'format' | 'y', patch: Record<string, unknown>): ChartDraft {
  const inner = patchDraft(isObject(draft[key])
    ? draft[key]
    : {}, patch)
  return patchDraft(draft, {
    [key]: Object.keys(inner).length
      ? inner
      : undefined,
  })
}

/** Every field the rows have, in the order they first appear. */
export function dataFields(draft: ChartDraft): string[] {
  const fields: string[] = []
  for (const row of rowsOf(draft)) {
    for (const key of Object.keys(row)) {
      if (!fields.includes(key))
        fields.push(key)
    }
  }
  return fields
}

function usedNames(draft: ChartDraft): Set<string> {
  return new Set([
    ...dataFields(draft),
    ...seriesOf(draft).map(series => series.key),
    ...(typeof draft.x === 'string'
      ? [draft.x]
      : []),
  ])
}

/** Keeps a row's field order, which is what the table shows. */
function renameKey(row: Row, from: string, to: string): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key === from
      ? to
      : key,
    value,
  ]))
}

/**
 * Renames a field everywhere it is used: every row, the category, the series and the
 * highlight. `null` when the new name is blank or already taken.
 */
export function renameField(draft: ChartDraft, from: string, to: string): ChartDraft | null {
  const name = to.trim()
  if (name === from)
    return draft
  if (!name || usedNames(draft).has(name))
    return null
  return {
    ...draft,
    ...(draft.x === from
      ? { x: name }
      : {}),
    ...(draft.highlight === from
      ? { highlight: name }
      : {}),
    ...(Array.isArray(draft.series)
      ? {
          series: draft.series.map(item => isObject(item) && item.key === from
            ? { ...item, key: name }
            : item),
        }
      : {}),
    ...(Array.isArray(draft.data)
      ? {
          data: draft.data.map(row => isObject(row)
            ? renameKey(row, from, name)
            : row),
        }
      : {}),
  }
}

function freshName(draft: ChartDraft, base: string): string {
  const used = usedNames(draft)
  let index = seriesOf(draft).length + 1
  while (used.has(`${base}${index}`))
    index++
  return `${base}${index}`
}

/** A new series with empty values. `null` when there are already six. */
export function addSeries(draft: ChartDraft): ChartDraft | null {
  const series = seriesOf(draft)
  if (series.length >= MAX_SERIES)
    return null
  const key = freshName(draft, 'series')
  return {
    ...draft,
    series: [
      ...(Array.isArray(draft.series)
        ? draft.series
        : []),
      { key },
    ],
    data: rowsOf(draft).map(row => ({ ...row, [key]: null })),
  }
}

/** Removes a series and its column. `null` for the last one: a chart needs one. */
export function removeSeries(draft: ChartDraft, key: string): ChartDraft | null {
  if (seriesOf(draft).length <= 1)
    return null
  const next: ChartDraft = {
    ...draft,
    series: (draft.series as unknown[]).filter(item => !(isObject(item) && item.key === key)),
    data: rowsOf(draft).map(({ [key]: _removed, ...rest }) => rest),
  }
  if (next.highlight === key)
    delete next.highlight
  return next
}

export function addRow(draft: ChartDraft): ChartDraft {
  const row: Row = typeof draft.x === 'string'
    ? { [draft.x]: '' }
    : {}
  for (const series of seriesOf(draft))
    row[series.key] = null
  return {
    ...draft,
    data: [
      ...rowsOf(draft),
      row,
    ],
  }
}

export function removeRow(draft: ChartDraft, index: number): ChartDraft {
  return {
    ...draft,
    data: rowsOf(draft).filter((_, position) => position !== index),
  }
}

/** A number, with commas allowed; `null` for blank; `undefined` for anything else. */
export function parseCellNumber(raw: string): number | null | undefined {
  const text = raw.trim().replaceAll(',', '')
  if (!text)
    return null
  const value = Number(text)
  return Number.isFinite(value)
    ? value
    : undefined
}

/** Categories are text; the rest numbers. `undefined` when the input isn't a number. */
export function setCell(draft: ChartDraft, index: number, key: string, raw: string): ChartDraft | undefined {
  let value: string | number | null
  if (key === draft.x) {
    value = raw
  }
  else {
    const parsed = parseCellNumber(raw)
    if (parsed === undefined)
      return undefined
    value = parsed
  }
  return {
    ...draft,
    data: rowsOf(draft).map((row, position) => position === index
      ? { ...row, [key]: value }
      : row),
  }
}

export interface PastedTable {
  draft: ChartDraft
  /** Cells where a number belongs but something else was pasted: stored as empty. */
  issues: { row: number, column: string, value: string }[]
  /** Columns past the sixth series, left out. */
  dropped: number
}

/** Spreadsheets quote cells that hold tabs or quotes; this only needs the text. */
function unquote(cell: string) {
  return /^".*"$/s.test(cell)
    ? cell.slice(1, -1).replaceAll('""', '"')
    : cell
}

/**
 * Text copied from a spreadsheet: the first row names the columns, the first column is the
 * category, and the rest are series. `null` when it is a single value, which is just typing.
 */
export function pasteTable(draft: ChartDraft, text: string): PastedTable | null {
  const lines = text.replace(/\r/g, '').split('\n')
  while (lines.length && !lines.at(-1)!.trim())
    lines.pop()
  if (lines.length < 2 && !lines[0]?.includes('\t'))
    return null
  const cells = lines.map(line => line.split('\t').map(cell => unquote(cell.trim())))
  const [header, ...body] = cells
  const names: string[] = []
  header.forEach((cell, index) => {
    let name = cell || (index
      ? `series${index}`
      : 'category')
    while (names.includes(name))
      name = `${name}_${index}`
    names.push(name)
  })
  const [x, ...columns] = names
  const kept = columns.slice(0, MAX_SERIES)
  const issues: PastedTable['issues'] = []
  const data = body.map((line, row) => {
    const record: Row = { [x]: line[0] ?? '' }
    kept.forEach((column, index) => {
      const raw = line[index + 1] ?? ''
      const value = parseCellNumber(raw)
      if (value === undefined)
        issues.push({ row, column, value: raw })
      record[column] = value ?? null
    })
    return record
  })
  const next: ChartDraft = {
    ...draft,
    x,
    series: kept.map((key, index) => ({ key, label: header[index + 1] || key })),
    data,
  }
  delete next.highlight
  return { draft: next, issues, dropped: columns.length - kept.length }
}

/** The name a series shows. Its key, the field in every row, stays; a blank name goes. */
export function setSeriesLabel(draft: ChartDraft, key: string, label: string): ChartDraft {
  if (!Array.isArray(draft.series))
    return draft
  const name = label.trim()
  return {
    ...draft,
    series: draft.series.map((item) => {
      if (!isObject(item) || item.key !== key)
        return item
      const { label: _old, ...rest } = item
      return name
        ? { ...rest, label: name }
        : rest
    }),
  }
}

/** The category column's name is the x-axis label: the field itself keeps its name. */
export function setCategoryLabel(draft: ChartDraft, label: string): ChartDraft {
  return patchDraft(draft, {
    xLabel: label.trim(),
  })
}

/** A pie draws the first series: put the chosen one first. The others and their data stay. */
export function choosePieSeries(draft: ChartDraft, key: string): ChartDraft {
  if (!Array.isArray(draft.series))
    return draft
  const index = draft.series.findIndex(item => isObject(item) && item.key === key)
  if (index <= 0)
    return draft
  const series = [...draft.series]
  const [chosen] = series.splice(index, 1)
  return {
    ...draft,
    series: [chosen, ...series],
  }
}
