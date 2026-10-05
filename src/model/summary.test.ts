import { describe, expect, it } from 'vitest'
import { summaryText } from '../ui/status'
import { createAccumulator, isNullLike } from './summary'

const count = (...values: string[]) => {
  const acc = createAccumulator()
  values.forEach((v) => acc.add(v))
  return acc.result()
}

describe('isNullLike', () => {
  it('knows the usual ways of writing "no value", whatever the case', () => {
    for (const text of ['null', 'NULL', ' None ', 'NaN', 'N/A', 'n/a', 'NA', 'nil']) expect(isNullLike(text)).toBe(true)
    for (const text of ['', 'nullable', 'Nancy', '0', 'no']) expect(isNullLike(text)).toBe(false)
  })
})

describe('createAccumulator', () => {
  it('counts blanks and nulls apart', () => {
    expect(count('a', '', '   ', 'null', 'N/A', '12')).toMatchObject({ cells: 6, blank: 2, nullLike: 2 })
  })
  it('counts the values that repeat, and the cells they fill', () => {
    expect(count('a', 'b', 'a', 'c', 'a', 'b')).toMatchObject({ duplicateValues: 2, duplicateCells: 5 })
  })
  it('counts the different values, each once however often it repeats, blanks left out', () => {
    expect(count('a', 'b', 'a', '', ' ', 'c').uniqueValues).toBe(3)
    expect(count('a', 'A', 'a ').uniqueValues).toBe(3)
    expect(count('', '').uniqueValues).toBe(0)
  })
  it('compares exactly: case and spaces matter, and blanks never repeat', () => {
    expect(count('a', 'A', 'a ', '', '', ' ', ' ')).toMatchObject({ duplicateValues: 0, duplicateCells: 0 })
  })
  it('treats numbers as the text they are', () => {
    expect(count('1', '1.0', '01', '1')).toMatchObject({ duplicateValues: 1, duplicateCells: 2 })
  })
  it('counts null text as a value like any other when it repeats', () => {
    expect(count('null', 'null')).toMatchObject({ nullLike: 2, duplicateValues: 1, duplicateCells: 2 })
  })
})

describe('summaryText', () => {
  it('says when there are no blanks and no duplicates', () => {
    expect(summaryText(count('a', 'b', 'c')).text).toBe('No blanks · 3 unique · No duplicates')
  })
  it('shows blanks and nulls only when there are some, and the duplicates', () => {
    expect(summaryText(count('a', '', 'null', 'null', 'a')).text).toBe('1 blank · 2 null · 2 unique · 2 duplicate values (4 cells)')
    expect(summaryText(count('x', 'x')).text).toBe('No blanks · 1 unique · 1 duplicate value (2 cells)')
  })
  it('explains itself in the tooltip', () => {
    const detail = summaryText(count('1', '', '1')).detail
    expect(detail).toContain('Blank: 1 (empty, or only spaces)')
    expect(detail).toContain('Unique: 1 different value (blanks left out)')
    expect(detail).toContain('Duplicates: 1 value repeat, in 2 cells')
  })
  it('never mentions numbers', () => {
    expect(summaryText(count('1', '2', '3')).text).not.toMatch(/sum|avg|numeric|min|max/i)
  })
})
