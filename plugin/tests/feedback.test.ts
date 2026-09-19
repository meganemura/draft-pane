// Direct tests of every export of hooks/feedback.ts: plain functions over a `Feedback` value,
// no `$`, no hooks.

import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY_FEEDBACK,
  commentCountOf,
  hasUnsentTextOf,
  selectionMessageOf,
  shortQuoteOf,
  withoutTrailingNewlinesOf,
  withSelection,
  withSpanCommitted,
  withSpanRemoved,
  withSpanText,
  withWholeCommitted,
  withWholeOpen,
  withWholeRemoved,
  withWholeText,
} from '../hooks/feedback'
import type { Feedback } from '../hooks/feedback'

describe('withSelection', () => {
  test('sets the selection and resets spanText', () => {
    const started = withSpanText(withSelection(EMPTY_FEEDBACK, { start: 1, end: 2 }), 'typed so far')
    expect(withSelection(started, { start: 3, end: 5 })).toEqual({ ...EMPTY_FEEDBACK, selection: { start: 3, end: 5 } })
  })

  test('leaves the input object unchanged', () => {
    const before: Feedback = { ...EMPTY_FEEDBACK, selection: { start: 1, end: 2 } }
    const snapshot = { ...before }
    withSelection(before, null)
    expect(before).toEqual(snapshot)
  })
})

describe('withSpanCommitted', () => {
  test('a selection then a commit appends a span and clears the selection', () => {
    const armed = withSelection(EMPTY_FEEDBACK, { start: 2, end: 8 })
    const committed = withSpanCommitted(armed, '  looks off  ')
    expect(committed).toEqual({
      selection: null,
      spanText: '',
      spans: [{ start: 2, end: 8, comment: 'looks off' }],
      whole: null,
      wholeText: '',
      wholeOpen: false,
    })
  })

  test('an empty commit drops the selection and appends nothing', () => {
    const armed = withSelection(EMPTY_FEEDBACK, { start: 2, end: 8 })
    expect(withSpanCommitted(armed, '   ')).toEqual(EMPTY_FEEDBACK)
  })

  test('a commit with no selection is a no-op', () => {
    expect(withSpanCommitted(EMPTY_FEEDBACK, 'anything')).toEqual(EMPTY_FEEDBACK)
  })

  test('leaves the input object unchanged', () => {
    const armed = withSelection(EMPTY_FEEDBACK, { start: 0, end: 3 })
    const snapshot = { ...armed, selection: { ...armed.selection } }
    withSpanCommitted(armed, 'a comment')
    expect(armed).toEqual(snapshot)
  })
})

describe('withSpanRemoved', () => {
  test('removes by index', () => {
    const withTwo: Feedback = {
      ...EMPTY_FEEDBACK,
      spans: [
        { start: 0, end: 1, comment: 'first' },
        { start: 2, end: 3, comment: 'second' },
      ],
    }
    expect(withSpanRemoved(withTwo, 0)).toEqual({ ...EMPTY_FEEDBACK, spans: [{ start: 2, end: 3, comment: 'second' }] })
  })

  test('an out-of-range index is a no-op', () => {
    const withOne: Feedback = { ...EMPTY_FEEDBACK, spans: [{ start: 0, end: 1, comment: 'only' }] }
    expect(withSpanRemoved(withOne, 5)).toEqual(withOne)
    expect(withSpanRemoved(withOne, -1)).toEqual(withOne)
  })

  test('leaves the input object unchanged', () => {
    const withOne: Feedback = { ...EMPTY_FEEDBACK, spans: [{ start: 0, end: 1, comment: 'only' }] }
    const snapshot = { ...withOne, spans: [...withOne.spans] }
    withSpanRemoved(withOne, 0)
    expect(withOne).toEqual(snapshot)
  })
})

describe('withWholeCommitted', () => {
  test('commits a whole-draft comment', () => {
    expect(withWholeCommitted(EMPTY_FEEDBACK, '  too long  ')).toEqual({ ...EMPTY_FEEDBACK, whole: 'too long', wholeText: '' })
  })

  test('a second commit replaces the first', () => {
    const once = withWholeCommitted(EMPTY_FEEDBACK, 'first take')
    expect(withWholeCommitted(once, 'second take')).toEqual({ ...EMPTY_FEEDBACK, whole: 'second take', wholeText: '' })
  })

  test('an empty commit removes it', () => {
    const once = withWholeCommitted(EMPTY_FEEDBACK, 'first take')
    expect(withWholeCommitted(once, '   ')).toEqual(EMPTY_FEEDBACK)
  })

  test('closes the field, whether or not the text was blank', () => {
    const open = withWholeOpen(EMPTY_FEEDBACK, true)
    expect(withWholeCommitted(open, 'a comment').wholeOpen).toBe(false)
    expect(withWholeCommitted(open, '   ').wholeOpen).toBe(false)
  })

  test('leaves the input object unchanged', () => {
    const before = withWholeText(EMPTY_FEEDBACK, 'typing')
    const snapshot = { ...before }
    withWholeCommitted(before, 'done')
    expect(before).toEqual(snapshot)
  })
})

describe('withWholeOpen', () => {
  test('sets wholeOpen, leaving the rest untouched', () => {
    expect(withWholeOpen(EMPTY_FEEDBACK, true)).toEqual({ ...EMPTY_FEEDBACK, wholeOpen: true })
    expect(withWholeOpen(withWholeOpen(EMPTY_FEEDBACK, true), false)).toEqual(EMPTY_FEEDBACK)
  })

  test('leaves the input object unchanged', () => {
    const snapshot = { ...EMPTY_FEEDBACK }
    withWholeOpen(EMPTY_FEEDBACK, true)
    expect(EMPTY_FEEDBACK).toEqual(snapshot)
  })
})

describe('withWholeRemoved', () => {
  test('clears the whole-draft comment', () => {
    const once = withWholeCommitted(EMPTY_FEEDBACK, 'first take')
    expect(withWholeRemoved(once)).toEqual(EMPTY_FEEDBACK)
  })

  test('leaves the input object unchanged', () => {
    const once = withWholeCommitted(EMPTY_FEEDBACK, 'first take')
    const snapshot = { ...once }
    withWholeRemoved(once)
    expect(once).toEqual(snapshot)
  })
})

describe('withSpanText / withWholeText', () => {
  test('mirror what the Input holds, leaving the rest untouched', () => {
    expect(withSpanText(EMPTY_FEEDBACK, 'draft text')).toEqual({ ...EMPTY_FEEDBACK, spanText: 'draft text' })
    expect(withWholeText(EMPTY_FEEDBACK, 'draft text')).toEqual({ ...EMPTY_FEEDBACK, wholeText: 'draft text' })
  })

  test('leaves the input object unchanged', () => {
    const snapshot = { ...EMPTY_FEEDBACK }
    withSpanText(EMPTY_FEEDBACK, 'x')
    withWholeText(EMPTY_FEEDBACK, 'x')
    expect(EMPTY_FEEDBACK).toEqual(snapshot)
  })
})

describe('commentCountOf', () => {
  test('counts every span plus one when there is a whole-draft comment', () => {
    expect(commentCountOf(EMPTY_FEEDBACK)).toBe(0)
    const withSpans: Feedback = { ...EMPTY_FEEDBACK, spans: [{ start: 0, end: 1, comment: 'a' }, { start: 2, end: 3, comment: 'b' }] }
    expect(commentCountOf(withSpans)).toBe(2)
    expect(commentCountOf({ ...withSpans, whole: 'also this' })).toBe(3)
  })
})

describe('hasUnsentTextOf', () => {
  test('false on EMPTY_FEEDBACK', () => {
    expect(hasUnsentTextOf(EMPTY_FEEDBACK)).toBe(false)
  })

  test('true while spanText holds more than whitespace', () => {
    expect(hasUnsentTextOf(withSpanText(EMPTY_FEEDBACK, 'not yet added'))).toBe(true)
    expect(hasUnsentTextOf(withSpanText(EMPTY_FEEDBACK, '   '))).toBe(false)
  })

  test('true while wholeText holds more than whitespace', () => {
    expect(hasUnsentTextOf(withWholeText(EMPTY_FEEDBACK, 'not yet added'))).toBe(true)
    expect(hasUnsentTextOf(withWholeText(EMPTY_FEEDBACK, '   '))).toBe(false)
  })
})

describe('selectionMessageOf', () => {
  test('rejects a non-object', () => {
    expect(selectionMessageOf(null)).toBeNull()
    expect(selectionMessageOf('selected')).toBeNull()
    expect(selectionMessageOf(42)).toBeNull()
  })

  test('rejects a missing or unknown type', () => {
    expect(selectionMessageOf({})).toBeNull()
    expect(selectionMessageOf({ type: 'unknown' })).toBeNull()
  })

  test('rejects end < start and a negative start', () => {
    expect(selectionMessageOf({ type: 'selected', start: 5, end: 2 })).toBeNull()
    expect(selectionMessageOf({ type: 'selected', start: -1, end: 2 })).toBeNull()
  })

  test('accepts cleared and a valid selected', () => {
    expect(selectionMessageOf({ type: 'cleared' })).toEqual({ type: 'cleared' })
    expect(selectionMessageOf({ type: 'selected', start: 2, end: 5 })).toEqual({ type: 'selected', start: 2, end: 5 })
  })
})

describe('withoutTrailingNewlinesOf', () => {
  test('drops a newline right at the end', () => {
    const body = 'first line\nsecond line\n'
    expect(withoutTrailingNewlinesOf(body, { start: 0, end: 11 })).toEqual({ start: 0, end: 10 })
  })

  test('drops two newlines in a row', () => {
    const body = 'first line\n\nsecond line'
    expect(withoutTrailingNewlinesOf(body, { start: 0, end: 12 })).toEqual({ start: 0, end: 10 })
  })

  test('a range not ending in a newline is unchanged', () => {
    const body = 'first line\nsecond line'
    const range = { start: 0, end: 10 }
    expect(withoutTrailingNewlinesOf(body, range)).toEqual(range)
  })

  test('a one-character range that is itself a newline stays, never shrinks to empty', () => {
    const body = 'first\n\nsecond'
    expect(withoutTrailingNewlinesOf(body, { start: 6, end: 7 })).toEqual({ start: 6, end: 7 })
  })
})

describe('shortQuoteOf', () => {
  test('collapses a newline (and any run of whitespace) to one space', () => {
    const body = 'first line\n   second   line'
    expect(shortQuoteOf(body, { start: 0, end: body.length })).toBe('first line second line')
  })

  test('truncates to maxLength with a trailing ellipsis', () => {
    const body = 'a'.repeat(60)
    const quote = shortQuoteOf(body, { start: 0, end: body.length })
    expect(quote).toBe(`${'a'.repeat(40)}…`)
  })

  test('a short slice is left exactly as it is, no ellipsis', () => {
    const body = 'short and sweet'
    expect(shortQuoteOf(body, { start: 0, end: body.length })).toBe('short and sweet')
  })
})
