/**
 * Step between round ticks, as d3 picks it. Below 1 it is returned negated and inverted
 * (−5 for 0.2), so ticks can be made by dividing, which keeps 0.6 from becoming 0.6000000001.
 */
function tickIncrement(start: number, stop: number, count: number): number {
  const step = (stop - start) / Math.max(1, count)
  const power = Math.floor(Math.log10(step))
  const error = step / 10 ** power
  const factor = error >= Math.sqrt(50)
    ? 10
    : error >= Math.sqrt(10)
      ? 5
      : error >= Math.sqrt(2)
        ? 2
        : 1
  return power >= 0
    ? factor * 10 ** power
    : -(10 ** -power) / factor
}

/** Round ticks from at or below `lo` to at or above `hi`, about `count` steps apart. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi))
    return [0, 1]
  if (hi === lo)
    return [lo, lo + 1]
  let start = lo
  let stop = hi
  let increment = tickIncrement(start, stop, count)
  // Rounding the ends can change the step; d3 settles it in a few rounds.
  for (let round = 0; round < 10; round++) {
    const next = increment > 0
      ? [Math.floor(start / increment) * increment, Math.ceil(stop / increment) * increment]
      : [Math.floor(start * -increment) / -increment, Math.ceil(stop * -increment) / -increment]
    const changed = next[0] !== start || next[1] !== stop
    start = next[0]
    stop = next[1]
    const following = tickIncrement(start, stop, count)
    if (!changed && following === increment)
      break
    increment = following
  }
  const ticks: number[] = []
  if (increment > 0) {
    for (let k = Math.round(start / increment); k <= Math.round(stop / increment); k++)
      ticks.push(k * increment)
  }
  else {
    for (let k = Math.round(start * -increment); k <= Math.round(stop * -increment); k++)
      ticks.push(k / -increment)
  }
  return ticks
}

export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  const span = d1 - d0 || 1
  return (value: number) => r0 + (value - d0) / span * (r1 - r0)
}

/** Evenly spaced bands for categories, centered in the range. */
export function bandScale(count: number, [r0, r1]: [number, number], paddingInner = 0.2, paddingOuter = 0.1) {
  const n = Math.max(1, count)
  const step = (r1 - r0) / Math.max(1, n - paddingInner + paddingOuter * 2)
  const bandwidth = step * (1 - paddingInner)
  const offset = r0 + (r1 - r0 - step * (n - paddingInner)) / 2
  return {
    step,
    bandwidth,
    start: (index: number) => offset + index * step,
    center: (index: number) => offset + index * step + bandwidth / 2,
  }
}
