// Pure geometry for splitting a draft's body into segments — one per line that already carries a
// comment (its anchor line), plus the rest after the last one — so mod.ts can draw one `Client`
// per segment and place that segment's comments right under it. No `$`, no drawing, no
// `Feedback` value: this file knows only lines, character offsets and anchor line numbers, never
// a comment's text or how a segment ends up on screen.

import { absoluteOffsetOf, posOf } from './draft-selection'

export type Segment = { index: number; firstLine: number; lastLine: number; baseOffset: number; lines: string[] }

// The line a comment sits on: the line holding the last character of its span, `end - 1`, never
// below `start` (an empty span still anchors to the line it starts on).
export function anchorLineOf(lines: readonly string[], span: { start: number; end: number }): number {
  return posOf(lines, Math.max(span.start, span.end - 1)).line
}

// `lines` split into segments at each anchor: segment `k` holds the lines after the previous
// anchor up to and including anchor `k`, in ascending order with duplicates dropped; a final
// segment holds whatever is left after the last anchor, omitted when that is nothing (the last
// line was itself an anchor).
export function segmentsOf(lines: readonly string[], anchorLines: readonly number[]): Segment[] {
  const maxLine = Math.max(lines.length - 1, 0)
  const clamped = anchorLines.map((line) => Math.min(Math.max(line, 0), maxLine))
  const sortedAnchors = [...new Set(clamped)].sort((a, b) => a - b)

  const segments: Segment[] = []
  let firstLine = 0
  for (const anchor of sortedAnchors) {
    segments.push({
      index: segments.length,
      firstLine,
      lastLine: anchor,
      baseOffset: absoluteOffsetOf(lines, { line: firstLine, col: 0 }),
      lines: lines.slice(firstLine, anchor + 1),
    })
    firstLine = anchor + 1
  }
  if (firstLine <= maxLine) {
    segments.push({
      index: segments.length,
      firstLine,
      lastLine: maxLine,
      baseOffset: absoluteOffsetOf(lines, { line: firstLine, col: 0 }),
      lines: lines.slice(firstLine, maxLine + 1),
    })
  }
  return segments
}

// `range`, given as offsets local to `segment`'s own text, converted to offsets into the whole
// body — the shape `SpanComment` and `Feedback.selection` keep.
export function toAbsolute(segment: Segment, range: { start: number; end: number }): { start: number; end: number } {
  return { start: segment.baseOffset + range.start, end: segment.baseOffset + range.end }
}

// The inverse of `toAbsolute`, or `null` when `range` (offsets into the whole body) does not lie
// inside `segment`'s own text — the case a `Client` outside the one the person dragged in must
// draw no highlight at all.
export function toLocal(segment: Segment, range: { start: number; end: number }): { start: number; end: number } | null {
  const start = range.start - segment.baseOffset
  const end = range.end - segment.baseOffset
  const textLength = segment.lines.join('\n').length
  if (start < 0 || end > textLength) return null
  return { start, end }
}
