// Direct tests of the plain helpers in hooks/desktop.ts. The tree it draws is tested through the
// hooks module in mod.test.ts, on a mounted desktop pane.

import { describe, expect, test } from 'claude-code/testing'

import type { Draft } from '../hooks/block'
import { fileHrefOf, previewKindOf, statsOf } from '../hooks/desktop'

function draftWith(file: string | null): Draft {
  return { number: 1, title: 'a made-up draft', body: 'text', file, revises: null }
}

describe('fileHrefOf', () => {
  test('an absolute path becomes a file: URL, with a space encoded', () => {
    expect(fileHrefOf('/work/my notes.md', '/elsewhere')).toBe('file:///work/my%20notes.md')
  })

  test('a relative path is read against the working directory', () => {
    expect(fileHrefOf('notes/a.md', '/work/')).toBe('file:///work/notes/a.md')
  })

  test('a path that cannot become absolute has no link', () => {
    expect(fileHrefOf('notes/a.md', '')).toBeNull()
    expect(fileHrefOf('C:\\notes\\a.md', 'C:\\work')).toBeNull()
  })
})

describe('previewKindOf', () => {
  test('a plain draft and a markdown or text file preview as markdown', () => {
    expect(previewKindOf(draftWith(null))).toBe('markdown')
    expect(previewKindOf(draftWith('/work/a.MD'))).toBe('markdown')
    expect(previewKindOf(draftWith('/work/a.txt'))).toBe('markdown')
  })

  test('any other file previews as code', () => {
    expect(previewKindOf(draftWith('/work/a.ts'))).toBe('code')
    expect(previewKindOf(draftWith('/work/Makefile'))).toBe('code')
  })
})

describe('statsOf', () => {
  test('counts lines, words and characters, with the singular for one', () => {
    expect(statsOf('one two\nthree')).toBe('2 lines · 3 words · 13 chars')
    expect(statsOf('one')).toBe('1 line · 1 word · 3 chars')
    expect(statsOf('')).toBe('0 lines · 0 words · 0 chars')
  })
})
