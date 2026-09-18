// Direct tests of every export of hooks/segments.ts: plain functions over lines, offsets and
// anchor line numbers, no `$`, no hooks.

import { describe, expect, test } from 'claude-code/testing'

import { anchorLineOf, segmentsOf, toAbsolute, toLocal } from '../hooks/segments'

// 'first line' (10 chars, offsets 0-9), 'second line' (11 chars, offsets 11-21), 'third line'
// (10 chars, offsets 23-32) — line1 starts at 11 (10 + the '\n'), line2 at 23 (11 + 11 + 1).
const LINES = ['first line', 'second line', 'third line']

describe('anchorLineOf', () => {
  test('a span inside one line anchors to that line', () => {
    // "line1 col2" through "line1 col5": offsets 13..16.
    expect(anchorLineOf(LINES, { start: 13, end: 16 })).toBe(1)
  })

  test('a span ending exactly at a line\'s last character anchors to that line', () => {
    // Starts at line0 col2 (offset 2), ends right after line1's last character 'e' (offset 22).
    expect(anchorLineOf(LINES, { start: 2, end: 22 })).toBe(1)
  })

  test('a span ending at the start of the next line anchors to the earlier line', () => {
    // Ends at offset 11, the first column of line1 — the span itself never reaches line1.
    expect(anchorLineOf(LINES, { start: 0, end: 11 })).toBe(0)
  })
})

describe('segmentsOf', () => {
  test('no anchors: one segment, base 0, holding every line', () => {
    expect(segmentsOf(LINES, [])).toEqual([{ index: 0, firstLine: 0, lastLine: 2, baseOffset: 0, lines: LINES }])
  })

  test('one middle anchor: two segments, each with its own baseOffset and lines', () => {
    expect(segmentsOf(LINES, [0])).toEqual([
      { index: 0, firstLine: 0, lastLine: 0, baseOffset: 0, lines: ['first line'] },
      { index: 1, firstLine: 1, lastLine: 2, baseOffset: 11, lines: ['second line', 'third line'] },
    ])
  })

  test('the last line as anchor: one segment, the trailing (empty) one omitted', () => {
    expect(segmentsOf(LINES, [2])).toEqual([{ index: 0, firstLine: 0, lastLine: 2, baseOffset: 0, lines: LINES }])
  })

  // Also the fixture with a Japanese line: 'これは日本語の行です' is 10 characters, no different
  // from an ASCII line of the same length to this file's offset arithmetic (only draft-selection.ts's
  // display-width drawing treats it differently).
  test('duplicate and unsorted anchors are deduplicated and sorted before segments are cut', () => {
    const lines = ['intro', 'これは日本語の行です', 'middle', 'end']
    expect(segmentsOf(lines, [3, 1, 1, 0])).toEqual([
      { index: 0, firstLine: 0, lastLine: 0, baseOffset: 0, lines: ['intro'] },
      { index: 1, firstLine: 1, lastLine: 1, baseOffset: 6, lines: ['これは日本語の行です'] },
      { index: 2, firstLine: 2, lastLine: 3, baseOffset: 17, lines: ['middle', 'end'] },
    ])
  })
})

describe('toAbsolute / toLocal', () => {
  const lines = ['intro', 'これは日本語の行です', 'middle', 'end']
  const segment = segmentsOf(lines, [0, 1])[1]
  if (segment === undefined) throw new Error('expected a segment')

  test('toAbsolute then toLocal round-trips a range inside the segment', () => {
    const local = { start: 2, end: 5 }
    const absolute = toAbsolute(segment, local)
    expect(absolute).toEqual({ start: 8, end: 11 })
    expect(toLocal(segment, absolute)).toEqual(local)
  })

  test('toLocal returns null for a range that starts before the segment', () => {
    expect(toLocal(segment, { start: 0, end: 5 })).toBeNull()
  })

  test('toLocal returns null for a range that ends past the segment\'s own text', () => {
    expect(toLocal(segment, { start: 6, end: 30 })).toBeNull()
  })
})
