// Direct tests of hooks/diff.ts: plain functions over two texts, no `$`, no hooks.

import { describe, expect, test } from 'claude-code/testing'

import { diffStatOf, unifiedDiffOf } from '../hooks/diff'

describe('unifiedDiffOf', () => {
  test('the same text gives the empty string', () => {
    expect(unifiedDiffOf('one\ntwo', 'one\ntwo')).toBe('')
  })

  test('a changed line is a removal, then its addition, inside its context', () => {
    expect(unifiedDiffOf('one\ntwo\nthree', 'one\nTWO\nthree')).toBe('@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three')
  })

  test('a line added at the top names line 0 on the old side', () => {
    expect(unifiedDiffOf('one', 'zero\none', 0)).toBe('@@ -0,0 +1,1 @@\n+zero')
  })

  test('two changes far apart make two hunks; two close together make one', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n')
    const far = unifiedDiffOf(before, before.replace('a', 'A').replace('j', 'J'), 1)
    expect(far).toBe('@@ -1,2 +1,2 @@\n-a\n+A\n b\n@@ -9,2 +9,2 @@\n i\n-j\n+J')
    const near = unifiedDiffOf(before, before.replace('a', 'A').replace('c', 'C'), 1)
    expect(near.match(/^@@/gm)).toHaveLength(1)
  })

  test('a removed last line keeps the lines before it as context', () => {
    expect(unifiedDiffOf('one\ntwo', 'one', 3)).toBe('@@ -1,2 +1,1 @@\n one\n-two')
  })
})

describe('diffStatOf', () => {
  test('counts added and removed lines, not the hunk header', () => {
    expect(diffStatOf('@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n+2b\n three')).toEqual({ added: 2, removed: 1 })
  })
})
