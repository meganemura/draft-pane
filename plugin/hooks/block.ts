// Pure parsing and formatting for the ```draft block and the feedback lines a Submit press
// sends. No `$`, no hooks, no Claude Code runtime beyond the `SessionMessage` type: mod.ts is
// the only caller, and every export here is a plain function over strings and the transcript's
// own messages. Must not know about the pane's drawing, a drag, or how a span was chosen —
// only the block's text shape and the feedback line shape.

import type { SessionMessage } from 'claude-code'

export type Draft = { number: number; title: string; body: string; revises: number | null }
export type OpenDraft = { draft: Draft; isDuplicate: boolean }
export type SpanComment = { start: number; end: number; comment: string }

export const FEEDBACK_HEADER_PREFIX = 'Feedback (draft-pane) on D'
export const APPROVED = '(approved)'
export const WHOLE_DRAFT = '(whole draft)'

// A block opens on three or more backticks followed by `draft`, and closes on a line of only
// backticks (at least as many as the opener) — so a four-backtick block can carry a three-
// backtick fence in its body without that fence line closing it early.
const OPEN_RE = /^(`{3,})draft[ \t]*$/
const CLOSE_RE = /^(`+)[ \t]*$/
const HEADER_RE = /^D(\d+)(?:\s*\(revises D(\d+)\))?:\s*(.*)$/
// Same shape as `${FEEDBACK_HEADER_PREFIX}<number>:`, spelled out so the pattern is visible
// in one place rather than built from the constant at runtime.
const FEEDBACK_LINE_RE = /^Feedback \(draft-pane\) on D(\d+):$/

// Leading and trailing blank lines (empty or whitespace only) dropped, an inner blank line
// kept — the body is the exact string the pane draws and the formatter slices, so nothing
// else here may change its length.
function trimBlankLines(lines: readonly string[]): string[] {
  const isBlank = (line: string): boolean => line.trim() === ''
  let start = 0
  let end = lines.length
  while (start < end && isBlank(lines[start] ?? '')) start += 1
  while (end > start && isBlank(lines[end - 1] ?? '')) end -= 1
  return lines.slice(start, end)
}

// `blockLines` is everything between the opener and the closer (or end of text), header line
// first. A missing or malformed header, or a body that trims away to nothing, drops the block
// rather than failing the whole parse: a model's draft can contain a stray block.
function draftOf(blockLines: readonly string[]): Draft | null {
  const headerLine = blockLines[0]
  if (headerLine === undefined) return null
  const headerMatch = HEADER_RE.exec(headerLine)
  if (headerMatch === null) return null
  const number = Number(headerMatch[1] ?? '')
  const revisesGroup = headerMatch[2]
  const revises = revisesGroup === undefined ? null : Number(revisesGroup)
  const title = (headerMatch[3] ?? '').trim()
  const body = trimBlankLines(blockLines.slice(1)).join('\n')
  if (body === '') return null
  return { number, title, body, revises }
}

// Every draft from every ```draft block in `text` (a message may carry more than one), in
// order. Text outside a block is ignored; an unclosed block runs to the end of the text.
export function draftsOf(text: string): Draft[] {
  const drafts: Draft[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const openMatch = OPEN_RE.exec(lines[i] ?? '')
    if (openMatch === null) {
      i += 1
      continue
    }
    const fenceLength = (openMatch[1] ?? '').length
    i += 1
    const blockLines: string[] = []
    while (i < lines.length) {
      const closeMatch = CLOSE_RE.exec(lines[i] ?? '')
      if (closeMatch !== null && (closeMatch[1] ?? '').length >= fenceLength) {
        i += 1
        break
      }
      blockLines.push(lines[i] ?? '')
      i += 1
    }
    const draft = draftOf(blockLines)
    if (draft !== null) drafts.push(draft)
  }
  return drafts
}

export function identityOf(draft: Draft): string {
  return `${draft.number}\n${draft.title}\n${draft.body}`
}

export function headerOf(draft: Draft): string {
  return `${FEEDBACK_HEADER_PREFIX}${draft.number}:`
}

// Every `Feedback (draft-pane) on D<n>:` line in `text`, as numbers, in order.
export function feedbackNumbersOf(text: string): number[] {
  const numbers: number[] = []
  for (const line of text.split('\n')) {
    const match = FEEDBACK_LINE_RE.exec(line.trim())
    if (match !== null) numbers.push(Number(match[1] ?? ''))
  }
  return numbers
}

// Every draft with an open number, deduplicated by identity (first occurrence kept), sorted by
// number ascending.
//
// Only the last assistant message that holds a ```draft block supplies candidates. Without that
// rule a draft the person never answered — an older topic, or one answered in plain words
// instead of from the pane — would stay open forever, next to whatever the model just wrote. An
// older draft is still readable in the transcript, and the model can post it again under a new
// number.
//
// Feedback numbers are still read from every non-assistant message: a feedback prompt for the
// newest draft can sit after the message that named it. `revised` is still built from every
// draft in every assistant message, not only the newest one's, since the newest message may
// itself carry both a draft and the revision that replaces it.
export function openDraftsOf(messages: readonly SessionMessage[]): OpenDraft[] {
  const allDrafts: Draft[] = []
  const feedbackNumbers: number[] = []
  let newestDrafts: Draft[] = []
  for (const message of messages) {
    if (message.role === 'assistant') {
      const drafts = draftsOf(message.text)
      allDrafts.push(...drafts)
      if (drafts.length > 0) newestDrafts = drafts
    } else {
      feedbackNumbers.push(...feedbackNumbersOf(message.text))
    }
  }

  const feedbackSet = new Set(feedbackNumbers)
  const revised = new Set<number>()
  for (const draft of allDrafts) {
    if (draft.revises !== null) revised.add(draft.revises)
  }

  const isOpen = (draft: Draft): boolean => !feedbackSet.has(draft.number) && !revised.has(draft.number)

  const seen = new Set<string>()
  const open: Draft[] = []
  for (const draft of newestDrafts) {
    if (!isOpen(draft)) continue
    const identity = identityOf(draft)
    if (seen.has(identity)) continue
    seen.add(identity)
    open.push(draft)
  }

  const identitiesByNumber = new Map<number, Set<string>>()
  for (const draft of open) {
    const identities = identitiesByNumber.get(draft.number) ?? new Set<string>()
    identities.add(identityOf(draft))
    identitiesByNumber.set(draft.number, identities)
  }

  return open
    .map((draft) => ({
      draft,
      isDuplicate: (identitiesByNumber.get(draft.number)?.size ?? 0) > 1,
    }))
    .sort((a, b) => a.draft.number - b.draft.number)
}

export function quoteOf(text: string): string {
  return text
    .split('\n')
    .map((line) => '> ' + line)
    .join('\n')
}

// The prompt a Submit press sends: the header, then for each span (in ascending `start` order,
// stable, regardless of the order given) the quoted slice of `draft.body` and the comment on
// its own line, then, when `whole` is given, one `(whole draft) <comment>` line.
export function feedbackTextOf(draft: Draft, spans: readonly SpanComment[], whole: string | null): string {
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  const lines: string[] = [headerOf(draft)]
  for (const span of ordered) {
    lines.push(quoteOf(draft.body.slice(span.start, span.end)))
    lines.push(span.comment)
  }
  if (whole !== null) lines.push(`${WHOLE_DRAFT} ${whole}`)
  return lines.join('\n')
}

export function approvalTextOf(draft: Draft): string {
  return [headerOf(draft), APPROVED].join('\n')
}
