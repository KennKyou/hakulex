import type { ChartSpec, ChartValue } from './spec'

export interface ChartTable {
  columns: string[]
  rows: ChartValue[][]
}

/** The data as a table: categories first, then one column per series. */
export function chartTable(spec: ChartSpec): ChartTable {
  return {
    columns: [
      spec.xLabel || spec.x,
      ...spec.series.map(series => series.label || series.key),
    ],
    rows: spec.data.map(row => [
      row[spec.x] ?? null,
      ...spec.series.map(series => row[series.key] ?? null),
    ]),
  }
}
