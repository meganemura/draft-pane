// The pane's tree on Claude Code Desktop. The terminal keeps the tree that mod.ts draws; the
// desktop has more elements (`Svg`, `Markdown`, `Code`, native buttons, borders that a hover can
// color), and this file uses them: each draft is a card with a header, a revision trail, a map of
// where the comments fall, and three views of the body — `Comment` (the drag-to-comment text the
// terminal also has), `Preview` (the body drawn as markdown, or a file draft's code with syntax
// colors), and `Changes` (a diff against the draft that this one revises).
//
// Must NOT know about: `$`, the transcript, or how a press changes state. mod.ts gives each draft
// as a `DesktopDraft` value, its segments already cut and its diff already computed, and the
// closures that a press or an input calls. The keys of the `Client`s, of the comment inputs and
// of the `Approve` and `Submit` buttons are the same as on the terminal, so mod.ts's `ui.message`
// handler and its focus calls need no second case.

import type { Elements, RenderElement } from 'claude-code'
import type { Draft } from './block'
import { diffStatOf } from './diff'
import type { Feedback } from './feedback'
import { commentCountOf, shortQuoteOf } from './feedback'
import type { Segment } from './segments'
import { anchorLineOf, toLocal } from './segments'
import { commentMapSvgOf, emptySheetSvgOf, revisionTrailSvgOf } from './svg'

export type DesktopUi = Pick<Elements['desktop'], 'Box' | 'Button' | 'Text' | 'Input' | 'Client' | 'Svg' | 'Markdown' | 'Code'>

export type View = 'comment' | 'preview' | 'changes'

export type DraftActions = {
  setView: (view: View) => void
  removeSpan: (index: number) => void
  removeWhole: () => void
  openWhole: () => void
  spanInput: (text: string) => void
  spanSubmit: (text: string) => void
  wholeInput: (text: string) => void
  wholeSubmit: (text: string) => void
  approve: () => void
  submit: () => void
}

export type DesktopDraft = {
  key: string
  draft: Draft
  isDuplicate: boolean
  feedback: Feedback
  readError: string | undefined
  view: View
  // The drafts this one revises, oldest first, this one last (block.ts's `revisionTrailOf`).
  trail: readonly Draft[]
  // The diff against the draft this one revises, or null when there is no earlier text to
  // compare: no `revises`, the earlier draft is not in the transcript, or either one is a file
  // draft (the transcript does not keep a file's earlier text).
  diff: string | null
  // The `file:` link for a file draft's path, or null.
  fileHref: string | null
  segments: readonly Segment[]
  actions: DraftActions
}

// `Markdown` and `Code` take at most 10000 characters. A longer body is cut at a line break
// before that limit, and a dim line under it says so.
const MAX_SOURCE = 9000

function cutOf(text: string): { text: string; isCut: boolean } {
  if (text.length <= MAX_SOURCE) return { text, isCut: false }
  const at = text.lastIndexOf('\n', MAX_SOURCE)
  return { text: text.slice(0, at > 0 ? at : MAX_SOURCE), isCut: true }
}

// The `file:` URL of a draft's path, made absolute against the session's working directory.
// Null for a path that does not become absolute (a Windows path, or no working directory), since
// a `file:` link must name an absolute path.
export function fileHrefOf(path: string, cwd: string): string | null {
  const absolute = path.startsWith('/') ? path : cwd.startsWith('/') ? `${cwd.replace(/\/+$/, '')}/${path}` : null
  if (absolute === null) return null
  return `file://${encodeURI(absolute)}`
}

// Plain drafts and markdown or text files show as markdown; any other file shows as code, with
// the language that `Code` infers from the path.
export function previewKindOf(draft: Draft): 'markdown' | 'code' {
  if (draft.file === null) return 'markdown'
  return /\.(md|markdown|mdx|txt)$/i.test(draft.file) ? 'markdown' : 'code'
}

export function statsOf(body: string): string {
  const lines = body === '' ? 0 : body.split('\n').length
  const words = body.split(/\s+/).filter((word) => word !== '').length
  return `${lines} ${lines === 1 ? 'line' : 'lines'} · ${words} ${words === 1 ? 'word' : 'words'} · ${body.length} chars`
}

function headerOf(ui: DesktopUi, d: DesktopDraft): RenderElement {
  const { Box, Text } = ui
  const { draft } = d
  return Box({
    key: `${d.key}:header`,
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 2,
    flexWrap: 'wrap',
    children: [
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [Text({ inverse: true, bold: true, children: ` D${draft.number} ` }), Text({ bold: true, children: draft.title })],
      }),
      Text({ dimColor: true, children: statsOf(draft.body) }),
    ],
  })
}

function trailOf(ui: DesktopUi, d: DesktopDraft): RenderElement | null {
  if (d.trail.length < 2) return null
  const { Box, Svg, Text } = ui
  const earlier = d.trail.at(-2) as Draft
  return Box({
    key: `${d.key}:trail`,
    flexDirection: 'row',
    columnGap: 1,
    alignItems: 'center',
    children: [
      Svg({
        source: revisionTrailSvgOf(d.trail.map(({ number, title }) => ({ number, title }))),
        alt: `Revisions: ${d.trail.map((draft) => `D${draft.number}`).join(', ')}`,
        isInteractive: true,
      }),
      Text({ dimColor: true, children: `revises D${earlier.number}` }),
    ],
  })
}

function tabsOf(ui: DesktopUi, d: DesktopDraft): RenderElement {
  const { Box, Button } = ui
  const tab = (view: View, label: string): RenderElement =>
    Button({ key: `${d.key}:view:${view}`, label, ...(d.view === view ? {} : { dimColor: true }), onPress: () => d.actions.setView(view) })
  const tabs = [tab('comment', 'Comment'), tab('preview', 'Preview')]
  if (d.diff !== null) {
    const { added, removed } = diffStatOf(d.diff)
    const earlier = d.trail.at(-2)
    tabs.push(tab('changes', `Changes from D${earlier?.number ?? '?'}  +${added} −${removed}`))
  }
  return Box({ key: `${d.key}:tabs`, flexDirection: 'row', columnGap: 1, children: tabs })
}

function commentMapOf(ui: DesktopUi, d: DesktopDraft): RenderElement | null {
  const { feedback, draft } = d
  if (feedback.spans.length === 0 && feedback.selection === null) return null
  const { Svg } = ui
  const marks = feedback.spans.map((span) => ({ start: span.start, end: span.end, tip: `“${shortQuoteOf(draft.body, span)}” ${span.comment}` }))
  const pending = feedback.selection === null ? null : { ...feedback.selection, tip: `“${shortQuoteOf(draft.body, feedback.selection)}” (no comment yet)` }
  const n = marks.length
  return Svg({
    source: commentMapSvgOf(draft.body.length, marks, pending),
    alt: `Where the ${n} ${n === 1 ? 'comment falls' : 'comments fall'} in the draft`,
    isInteractive: true,
  })
}

function commentCardOf(ui: DesktopUi, key: string, quote: string, comment: string, removeKey: string, onRemove: () => void): RenderElement {
  const { Box, Button, Text } = ui
  return Box({
    key,
    flexDirection: 'column',
    borderStyle: 'round',
    borderDimColor: true,
    hover: { borderColor: 'cyan' },
    paddingX: 1,
    children: [
      Box({
        flexDirection: 'row',
        justifyContent: 'space-between',
        columnGap: 1,
        children: [Text({ italic: true, dimColor: true, children: quote }), Button({ key: removeKey, label: 'Remove', dimColor: true, onPress: onRemove })],
      }),
      Text({ children: comment }),
    ],
  })
}

function spanCardOf(ui: DesktopUi, d: DesktopDraft, spanIndex: number): RenderElement {
  const span = d.feedback.spans[spanIndex] as Feedback['spans'][number]
  return commentCardOf(ui, `${d.key}:c${spanIndex}`, `“${shortQuoteOf(d.draft.body, span)}”`, span.comment, `${d.key}:c${spanIndex}:remove`, () =>
    d.actions.removeSpan(spanIndex),
  )
}

// The span indexes of `feedback.spans` in reading order, each kept with its own index so a
// card's `Remove` still removes the span it shows.
function spanOrderOf(feedback: Feedback): number[] {
  return feedback.spans
    .map((span, index) => ({ start: span.start, index }))
    .sort((a, b) => a.start - b.start)
    .map(({ index }) => index)
}

function pendingInputOf(ui: DesktopUi, d: DesktopDraft): RenderElement {
  const { Box, Text, Input } = ui
  const selection = d.feedback.selection as NonNullable<Feedback['selection']>
  return Box({
    key: `${d.key}:span-input-row`,
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: 'blue',
    paddingX: 1,
    children: [
      Text({ italic: true, dimColor: true, children: `“${shortQuoteOf(d.draft.body, selection)}”` }),
      Input({
        key: `${d.key}:span-input`,
        label: 'comment',
        placeholder: 'Enter adds it; empty Enter drops the span',
        value: d.feedback.spanText,
        autoFocus: true,
        onInput: (value) => d.actions.spanInput(value),
        onSubmit: (value) => d.actions.spanSubmit(value),
      }),
    ],
  })
}

// The `Comment` view: the same segments and `Client`s as the terminal, with each comment as a
// card right under the line that it ends on.
function commentViewOf(ui: DesktopUi, d: DesktopDraft): RenderElement[] {
  const { Box, Client, Text } = ui
  const lines = d.draft.body.split('\n')
  const order = spanOrderOf(d.feedback)
  const selection = d.feedback.selection
  const children: RenderElement[] = []
  if (commentCountOf(d.feedback) === 0 && selection === null) {
    children.push(Text({ dimColor: true, children: 'Drag over the text to comment on a span.' }))
  }
  d.segments.forEach((segment, k) => {
    const armedRange = selection === null ? null : toLocal(segment, selection)
    children.push(
      Client({
        key: `${d.key}:seg${k}`,
        // A string literal, not a constant: the validator reads a Client's `module` statically.
        module: './draft-selection.ts',
        props: { lines: segment.lines, ...(armedRange === null ? {} : { armedRange }) },
        width: '100%',
      }),
    )
    const rows: RenderElement[] = order
      .filter((index) => anchorLineOf(lines, d.feedback.spans[index] as Feedback['spans'][number]) === segment.lastLine)
      .map((index) => spanCardOf(ui, d, index))
    if (selection !== null && anchorLineOf(lines, selection) === segment.lastLine) rows.push(pendingInputOf(ui, d))
    children.push(Box({ key: `${d.key}:seg${k}:rows`, flexDirection: 'column', rowGap: 1, children: rows }))
  })
  return children
}

function cutNoteOf(ui: DesktopUi, isCut: boolean): RenderElement[] {
  return isCut ? [ui.Text({ dimColor: true, children: 'The rest is cut here. The Comment view shows all of it.' })] : []
}

// The `Preview` view: the body as the person will read it, then every committed comment as a
// card, so a comment stays in sight while the person reads.
function previewViewOf(ui: DesktopUi, d: DesktopDraft): RenderElement[] {
  const { Code, Markdown } = ui
  const { text, isCut } = cutOf(d.draft.body)
  const body =
    previewKindOf(d.draft) === 'markdown'
      ? Markdown({ key: `${d.key}:preview`, text })
      : Code({ source: text, startLine: 1, ...(d.draft.file === null ? {} : { path: d.draft.file }) })
  return [body, ...cutNoteOf(ui, isCut), ...spanOrderOf(d.feedback).map((index) => spanCardOf(ui, d, index))]
}

// The `Changes` view: what changed since the draft this one revises, as `diff -u` hunks.
function changesViewOf(ui: DesktopUi, d: DesktopDraft): RenderElement[] {
  const { Code, Text } = ui
  if (d.diff === null || d.diff === '') return [Text({ dimColor: true, children: 'No change in the text.' })]
  const { text, isCut } = cutOf(d.diff)
  return [Code({ source: text, format: 'diff' }), ...cutNoteOf(ui, isCut)]
}

function wholeOf(ui: DesktopUi, d: DesktopDraft): RenderElement[] {
  const { Box, Input } = ui
  const out: RenderElement[] = []
  const whole = d.feedback.whole
  if (whole !== null) {
    out.push(commentCardOf(ui, `${d.key}:whole`, 'Whole draft', whole, `${d.key}:whole:remove`, () => d.actions.removeWhole()))
  }
  if (d.feedback.wholeOpen) {
    out.push(
      Box({
        key: `${d.key}:whole-input-row`,
        borderStyle: 'round',
        borderColor: 'blue',
        paddingX: 1,
        children: [
          Input({
            key: `${d.key}:whole-input`,
            label: 'whole draft',
            placeholder: 'comment on the whole draft',
            value: d.feedback.wholeText,
            autoFocus: true,
            onInput: (value) => d.actions.wholeInput(value),
            onSubmit: (value) => d.actions.wholeSubmit(value),
          }),
        ],
      }),
    )
  }
  return out
}

function actionsOf(ui: DesktopUi, d: DesktopDraft): RenderElement {
  const { Box, Button, Text } = ui
  const n = commentCountOf(d.feedback)
  return Box({
    key: `${d.key}:actions`,
    flexDirection: 'row',
    columnGap: 1,
    alignItems: 'center',
    flexWrap: 'wrap',
    children: [
      Button({ key: `${d.key}:whole-button`, label: d.feedback.whole === null ? 'Comment on the whole draft' : 'Change the whole-draft comment', dimColor: true, onPress: () => d.actions.openWhole() }),
      Button({ key: `${d.key}:approve`, label: 'Approve', onPress: () => d.actions.approve() }),
      Button({ key: `${d.key}:submit`, label: n === 0 ? 'Submit' : `Submit ${n} ${n === 1 ? 'comment' : 'comments'}`, onPress: () => d.actions.submit() }),
      n === 0 ? Text({ dimColor: true, children: 'no comments yet' }) : Text({ color: 'green', children: 'ready to send' }),
    ],
  })
}

export function desktopDraftOf(ui: DesktopUi, d: DesktopDraft): RenderElement {
  const { Box, Markdown, Text } = ui
  const { draft } = d
  const children: RenderElement[] = [headerOf(ui, d)]
  if (d.isDuplicate) children.push(Text({ color: 'yellow', children: 'Another draft has the same number.' }))
  const trail = trailOf(ui, d)
  if (trail !== null) children.push(trail)

  const card = (): RenderElement =>
    Box({ key: d.key, flexDirection: 'column', rowGap: 1, borderStyle: 'round', borderColor: 'gray', paddingX: 1, children })

  if (draft.file !== null) {
    const name = draft.file.split('/').at(-1) ?? draft.file
    const label = name.replace(/[[\]\\]/g, '\\$&')
    children.push(Markdown({ text: d.fileHref === null ? `file: \`${draft.file}\`` : `file: [${label}](${d.fileHref}) \`${draft.file}\``, dimColor: true }))
    if (d.readError !== undefined) {
      children.push(Text({ color: 'red', children: `Cannot read the file: ${d.readError}` }))
      return card()
    }
    if (draft.body === '') {
      children.push(Text({ children: 'The file is empty.' }))
      return card()
    }
  }

  children.push(tabsOf(ui, d))
  const map = commentMapOf(ui, d)
  if (map !== null) children.push(map)

  if (d.view === 'preview') children.push(...previewViewOf(ui, d))
  else if (d.view === 'changes') children.push(...changesViewOf(ui, d))
  else children.push(...commentViewOf(ui, d))

  children.push(...wholeOf(ui, d), actionsOf(ui, d))
  return card()
}

export function desktopEmptyOf(ui: DesktopUi): RenderElement {
  const { Box, Markdown, Svg, Text } = ui
  return Box({
    key: 'empty',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: 1,
    paddingY: 2,
    children: [
      Svg({ source: emptySheetSvgOf(), alt: 'A blank sheet', width: 64, height: 64 }),
      Text({ bold: true, children: 'No open drafts' }),
      Markdown({ text: 'Ask for one with `/draft-pane:draft <what to draft>`. The newest draft opens here.', dimColor: true }),
    ],
  })
}
