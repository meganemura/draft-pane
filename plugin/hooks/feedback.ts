// Pure state for one draft's pending feedback: the span just dragged and not yet commented on,
// the committed span comments, and the one committed whole-draft comment. No `$`, no hooks —
// mod.ts is the only caller, and every export here is a plain function over a `Feedback` value.
// Must not know about how a drag is drawn (draft-selection.ts) or how a draft's body is parsed
// or how a feedback prompt is written (block.ts) — only this pane's own pending state.

import type { SpanComment } from './block'
import type { SelectionMessage } from './draft-selection'

export type Selection = { start: number; end: number }

// `spanText` and `wholeText` mirror what their `Input` holds. Every redraw hands the `Input`
// its `value` again (the engine has no state of its own for it), so without a mirror here a
// redraw triggered by a finished turn or a fresh drag on another draft would hand the `Input`
// back an empty string and silently erase what the person had already typed.
export type Feedback = {
  selection: Selection | null
  spanText: string
  spans: SpanComment[]
  whole: string | null
  wholeText: string
}

export const EMPTY_FEEDBACK: Feedback = { selection: null, spanText: '', spans: [], whole: null, wholeText: '' }

export function withSelection(feedback: Feedback, selection: Selection | null): Feedback {
  return { ...feedback, selection, spanText: '' }
}

export function withSpanText(feedback: Feedback, text: string): Feedback {
  return { ...feedback, spanText: text }
}

// No selection: nothing to attach the comment to, so the commit is a no-op. An empty Enter
// (only whitespace) is how the person cancels a drag — it drops the selection and adds nothing,
// rather than committing a blank comment.
export function withSpanCommitted(feedback: Feedback, text: string): Feedback {
  const selection = feedback.selection
  if (selection === null) return feedback
  const trimmed = text.trim()
  if (trimmed === '') return { ...feedback, selection: null, spanText: '' }
  return {
    ...feedback,
    selection: null,
    spanText: '',
    spans: [...feedback.spans, { start: selection.start, end: selection.end, comment: trimmed }],
  }
}

export function withSpanRemoved(feedback: Feedback, index: number): Feedback {
  if (index < 0 || index >= feedback.spans.length) return feedback
  return { ...feedback, spans: [...feedback.spans.slice(0, index), ...feedback.spans.slice(index + 1)] }
}

export function withWholeText(feedback: Feedback, text: string): Feedback {
  return { ...feedback, wholeText: text }
}

// `whole` holds at most one comment: a second Enter replaces the first rather than adding a
// second. An empty Enter removes it.
export function withWholeCommitted(feedback: Feedback, text: string): Feedback {
  const trimmed = text.trim()
  return { ...feedback, whole: trimmed === '' ? null : trimmed, wholeText: '' }
}

export function withWholeRemoved(feedback: Feedback): Feedback {
  return { ...feedback, whole: null }
}

export function commentCountOf(feedback: Feedback): number {
  return feedback.spans.length + (feedback.whole === null ? 0 : 1)
}

// True while an Input holds text Enter has not yet turned into a span or whole-draft comment —
// the case a Submit or Approve press must refuse, or that text would be lost with no word said.
export function hasUnsentTextOf(feedback: Feedback): boolean {
  return feedback.spanText.trim() !== '' || feedback.wholeText.trim() !== ''
}

// `data` came from a draft-selection.ts Client's post — code sent it, not the engine — so this
// is the one place that message is checked before mod.ts trusts its shape.
export function selectionMessageOf(data: unknown): SelectionMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const type = Reflect.get(data, 'type')
  if (type === 'cleared') return { type: 'cleared' }
  if (type !== 'selected') return null
  const start = Reflect.get(data, 'start')
  const end = Reflect.get(data, 'end')
  if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end < start) return null
  return { type: 'selected', start, end }
}

// The quote line drawn above a span's Input and the first column of a comment row: the slice
// collapsed to one line (a dragged span can cross a newline) and cut short so a long quote does
// not crowd out the comment beside it.
export function shortQuoteOf(body: string, selection: Selection, maxLength = 40): string {
  const collapsed = body.slice(selection.start, selection.end).replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength)}…`
}
