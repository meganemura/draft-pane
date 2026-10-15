// Direct tests of hooks/svg.ts: plain functions that return SVG markup, no `$`, no hooks.

import { describe, expect, test } from 'claude-code/testing'

import { commentMapSvgOf, emptySheetSvgOf, escapeXml, revisionTrailSvgOf } from '../hooks/svg'

describe('escapeXml', () => {
  test('writes the five XML characters as entities', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;')
  })
})

describe('commentMapSvgOf', () => {
  test('a mark sits at its place along the bar, with its text as a tooltip', () => {
    const svg = commentMapSvgOf(100, [{ start: 50, end: 75, tip: 'a <short> note' }], null, 200)
    expect(svg).toContain('<rect class="mark" x="100" y="2" width="50"')
    expect(svg).toContain('<title>a &lt;short&gt; note</title>')
    expect(svg).not.toContain('class="pending"')
  })

  test('a span too short to see is 3 units wide, and stays inside the bar', () => {
    const svg = commentMapSvgOf(1000, [{ start: 1000, end: 1000, tip: 't' }], null, 100)
    expect(svg).toContain('x="97" y="2" width="3"')
  })

  test('the pending selection is an outlined mark', () => {
    expect(commentMapSvgOf(10, [], { start: 0, end: 5, tip: 'p' }, 100)).toContain('<rect class="pending" x="0" y="2" width="50"')
  })

  test('an empty body draws the bar alone, with no division by zero', () => {
    expect(commentMapSvgOf(0, [{ start: 0, end: 0, tip: 't' }], null)).not.toContain('NaN')
  })
})

describe('revisionTrailSvgOf', () => {
  test('one dot for each draft, the last one filled, each titled', () => {
    const svg = revisionTrailSvgOf([
      { number: 1, title: 'first' },
      { number: 4, title: 'second & last' },
    ])
    expect(svg.match(/<circle/g)).toHaveLength(2)
    expect(svg).toContain('<circle class="dot now"')
    expect(svg).toContain('<title>D4: second &amp; last</title>')
    expect(svg).toContain('>D1</text>')
  })
})

describe('emptySheetSvgOf', () => {
  test('is one SVG document', () => {
    const svg = emptySheetSvgOf()
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
  })
})
