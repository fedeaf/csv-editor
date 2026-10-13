// Runs of rows or columns, as [first, last] pairs of indexes. Selecting separate rows or columns with Ctrl keeps a
// list of them.

export type Interval = [number, number]

/** Sorted from the first, with those that overlap or touch joined, so that [1, 3] and [4, 6] become [1, 6]. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.map(([a, b]): Interval => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0])
  const merged: Interval[] = []
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1]
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged
}

export function containsIndex(list: Interval[], index: number): boolean {
  return list.some(([from, to]) => index >= from && index <= to)
}

/** How many indexes the intervals hold, counting each once. */
export function countIndexes(list: Interval[]): number {
  return mergeIntervals(list).reduce((total, [from, to]) => total + (to - from + 1), 0)
}
