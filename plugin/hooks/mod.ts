// draft-pane's one function-hooks module (the validator admits one per plugin). Reads the
// ```draft blocks the model posts in the transcript, shows every one still open in a pane
// beside it, and lets the person drag a span of the body to comment on it, or write one comment
// on the whole draft. A body is drawn as a column of segments, cut at each line that already
// carries a comment, so a comment and its input sit right under the line they belong to; one
// `Client` draws each segment. One Submit sends every comment as one prompt that quotes each
// span; one Approve sends nothing but a plain approval line. The transcript is the source of
// truth: every draft shown here is an assistant message, and every piece of feedback sent is a
// prompt that quotes it back.
//
// A block may name a file instead of carrying the draft's text (block.ts's `Draft.file`). Every
// `reparse` rereads that file for each open file draft and fills `draft.body` from it, so the
// pane always shows what is on disk as of the newest parse; a read failure is kept in
// `state.readErrors` and drawn in place of the body rather than logged, since it is the person's
// to see, not the operator's.
//
// Must NOT know about: what a draft says, or how a ```draft block or a feedback prompt is
// written — block.ts owns that syntax, and this file only calls its exported functions; how a
// drag maps to a character range — draft-selection.ts owns that, and this file only reads what
// it posts; how a body splits into segments or how an offset moves between a segment's own text
// and the whole body — segments.ts owns that, and this file only calls its exported functions.
//
// It loads only where Claude Code has function hooks enabled. The engine's validator reads this
// file statically, so every call on `$` is spelled `$.noun.event(...)` and `$` is handed only
// to the function declaration at the top of the file (`hostOf`); the rest of the module holds a
// `Host`, a bundle of closures built once at `session.start`. The transcript is parsed on
// `session.start` and `turn.complete` only, kept in `state.open`; `ui.render` draws from state
// alone and never reads the transcript itself.

import type { Elements, On, RenderElement, SessionMessage } from 'claude-code'
import { approvalTextOf, feedbackTextOf, identityOf, openDraftsOf, trimmedBodyOf } from './block'
import type { Draft, OpenDraft } from './block'
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
  withWholeRemoved,
  withWholeText,
} from './feedback'
import type { Feedback } from './feedback'
import { anchorLineOf, segmentsOf, toAbsolute, toLocal } from './segments'
import type { Segment } from './segments'

const PANE_ID = 'draft-pane'
const COMMAND = 'draft-pane'
const STORE_KEY = 'wantsOpen'

type Host = {
  messages: () => Promise<readonly SessionMessage[]>
  submit: (text: string) => Promise<{ drop?: string }>
  status: (text: string | undefined) => void
  open: (focus: boolean) => Promise<void>
  close: () => Promise<void>
  invalidate: () => void
  log: (text: string) => void
  register: () => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  focus: (key: string) => Promise<{ deny?: string }>
  sleep: (ms: number) => Promise<void>
  readFile: (path: string) => Promise<string>
}

type State = {
  host: Host | null
  isOpen: boolean
  wantsOpen: boolean
  open: OpenDraft[]
  // The session's working directory (`e.cwd` at `session.start`), the base a file draft's
  // relative path reads against.
  cwd: string
  // A draft's pending feedback, by identity (block.ts's `identityOf`).
  feedback: Map<string, Feedback>
  // Identities a Submit or Approve already sent, this process only (see `submit`'s own note).
  sent: Set<string>
  isSubmitting: boolean
  // A file draft's read failure, by identity, computed from the draft as left after the failed
  // read (empty body). Drawn in place of the body; cleared once that identity is no longer open.
  readErrors: Map<string, string>
}

// The host is a bundle of closures over `$`, built once at `session.start`, so the rest of this
// file never holds `$` itself — the validator's rule, and also the seam a test fakes.
function hostOf($: any): Host {
  return {
    messages: () => $.session.messages(),
    submit: (text) => $.prompt.submit({ text }),
    status: (text) => $.ui.status(text),
    open: (focus) => $.ui.open({ id: PANE_ID, title: PANE_ID, ...(focus ? { focus: true } : {}) }),
    close: () => $.ui.close({ id: PANE_ID }),
    invalidate: () => $.ui.invalidate('ui.render'),
    log: (text) => $.ui.log(text),
    register: () => $.command.register({ name: COMMAND, description: 'Show or hide the draft-pane' }),
    storeGet: (key) => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    focus: (key) => $.ui.focus({ requestId: PANE_ID, key }),
    sleep: (ms) => $.clock.sleep(ms),
    readFile: (path) => $.fs.read(path),
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// A drag's release posts before the redraw that draws the comment `Input` exists: `$.ui.invalidate`
// only schedules that redraw (at most thirty a second for the shown pane), so a `focus` call right
// after can find no element under the key yet. The `deny` names that missing element rather than
// any other failure, so it is safe to retry on; ten tries at 50ms apart cover the slowest redraw
// cadence with room, without retrying a `deny` that means something else.
async function focusSpanInput(host: Host, key: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await host.focus(key)
      if (result.deny === undefined) return
      if (attempt < 9) {
        await host.sleep(50)
      } else {
        host.log(`focus denied: ${result.deny}`)
      }
    }
  } catch (error) {
    host.log(`focus failed: ${messageOf(error)}`)
  }
}

// The drafts still worth drawing: `state.open` less whatever a Submit or Approve already sent.
// `sent` survives a `reparse` on purpose (see `submit`'s own note) so it, not `state.open`, is
// the filter applied here.
function visibleOf(state: State): OpenDraft[] {
  return state.open.filter((od) => !state.sent.has(identityOf(od.draft)))
}

function updateStatus(state: State): void {
  const host = state.host
  if (host === null) return
  const visible = visibleOf(state)
  if (state.isOpen || visible.length === 0) {
    host.status(undefined)
    return
  }
  const word = visible.length === 1 ? 'draft' : 'drafts'
  host.status(`${visible.length} open ${word} (/draft-pane)`)
}

// `$.store` is the plugin's own file, kept across sessions and hot reloads and shared by every
// session in every directory — one flag in it cannot mean "the pane is open", or a pane left
// open in one session would reopen empty at the start of every later one. It means the person
// wants the pane; the pane itself opens only once there is a draft worth showing it for. Used
// from `session.start` (by way of `reparse`, below) and from `reparse` itself on
// `turn.complete`, so a draft that appears mid-session opens the pane the same way one already
// open at session start does.
async function openIfWanted(state: State): Promise<void> {
  const host = state.host
  if (host === null || !state.wantsOpen || state.isOpen || visibleOf(state).length === 0) return
  try {
    // Not focused: opening on its own, unasked, must not take the keyboard away from whatever
    // the person is about to type.
    await host.open(false)
    state.isOpen = true
  } catch (error) {
    host.log(`reopen failed: ${messageOf(error)}`)
  }
}

// A file draft's body read fresh from disk, in parallel with every other open file draft's, so
// one missing file does not delay or fail the rest. Mutates `draft.body` in place (the draft is
// this `reparse`'s own, freshly parsed, so nothing else holds a reference yet) and records or
// clears `state.readErrors` under the identity that body leaves the draft with.
async function readFileDraft(state: State, host: Host, draft: Draft): Promise<void> {
  const path = draft.file
  if (path === null) return
  try {
    const text = await host.readFile(path)
    draft.body = trimmedBodyOf(text)
    state.readErrors.delete(identityOf(draft))
  } catch (error) {
    draft.body = ''
    state.readErrors.set(identityOf(draft), messageOf(error))
  }
}

// Re-reads the transcript into `state.open`, rereads every open file draft's file, drops any
// pending feedback or read error whose draft is no longer open (approved, submitted or gone from
// the transcript, on some other path), and redraws. Wrapped whole in a try/catch: a hook is
// fail-open, so a parse failure must not vanish silently — it goes to `host.log` once instead.
async function reparse(state: State): Promise<void> {
  const host = state.host
  if (host === null) return
  try {
    state.open = openDraftsOf(await host.messages())
    await Promise.all(state.open.map((od) => readFileDraft(state, host, od.draft)))
    const openIdentities = new Set(state.open.map((od) => identityOf(od.draft)))
    for (const identity of state.feedback.keys()) {
      if (!openIdentities.has(identity)) state.feedback.delete(identity)
    }
    for (const identity of state.readErrors.keys()) {
      if (!openIdentities.has(identity)) state.readErrors.delete(identity)
    }
    host.invalidate()
    await openIfWanted(state)
    updateStatus(state)
  } catch (error) {
    host.log(`reparse failed: ${messageOf(error)}`)
  }
}

function feedbackOf(state: State, identity: string): Feedback {
  return state.feedback.get(identity) ?? EMPTY_FEEDBACK
}

// A draft's body cut into segments, each ending at the line under which a comment sits (its
// anchor line): one per committed span, plus the pending selection when there is one. Called
// from both sides of the `ui.message` handler and `draftBoxOf`, so a segment index posted by one
// always means the same segment to the other.
function segmentsForDraft(draft: Draft, feedback: Feedback): Segment[] {
  const lines = draft.body.split('\n')
  const anchorLines = feedback.spans.map((span) => anchorLineOf(lines, span))
  if (feedback.selection !== null) anchorLines.push(anchorLineOf(lines, feedback.selection))
  return segmentsOf(lines, anchorLines)
}

// `isSubmitting` guards a press arriving while a previous submit is still in flight. Sending
// nothing when there is no comment guards the other press pattern: focus already sitting on
// Submit, one Enter with nothing said, spending a whole turn on an empty prompt nobody chose.
async function submit(state: State, host: Host, draft: Draft): Promise<void> {
  if (state.isSubmitting) return
  const identity = identityOf(draft)
  const feedback = feedbackOf(state, identity)
  if (hasUnsentTextOf(feedback)) {
    host.status(`D${draft.number} has text in an input; press Enter to add it, or clear it`)
    return
  }
  if (commentCountOf(feedback) === 0) {
    host.status('add a comment or press Approve before Submit')
    return
  }

  state.isSubmitting = true
  try {
    const result = await host.submit(feedbackTextOf(draft, feedback.spans, feedback.whole))
    if (result.drop === undefined) {
      state.sent.add(identity)
      state.feedback.delete(identity)
      host.status(undefined)
      host.invalidate()
    }
    // A `drop` leaves the draft and its pending feedback exactly where they were, so the person
    // can press Submit again without redoing anything.
  } finally {
    state.isSubmitting = false
  }
}

// Approve refuses while there is a pending comment: a comment left unsent under an Approve
// would read, on the transcript, as if the person had nothing to say about it.
async function approve(state: State, host: Host, draft: Draft): Promise<void> {
  if (state.isSubmitting) return
  const identity = identityOf(draft)
  const feedback = feedbackOf(state, identity)
  // The kit cannot type into an Input, so this guard is never reached from mod.test.ts.
  if (hasUnsentTextOf(feedback)) {
    host.status(`D${draft.number} has text in an input; press Enter to add it, or clear it`)
    return
  }
  if (commentCountOf(feedback) > 0) {
    host.status(`D${draft.number} has comments; press Submit, or remove them first`)
    return
  }

  state.isSubmitting = true
  try {
    const result = await host.submit(approvalTextOf(draft))
    if (result.drop === undefined) {
      state.sent.add(identity)
      state.feedback.delete(identity)
      host.status(undefined)
      host.invalidate()
    }
  } finally {
    state.isSubmitting = false
  }
}

// The transitions behind an `Input` or a `Button`, each one line so the closure drawn beside it
// stays one line too (the test kit cannot type into an `Input`, so these are what feedback.test.ts
// covers instead).
// No `host.invalidate()` here: the `Input` already shows what the person types, so redrawing on
// every keystroke is wasted work, and it can move the cursor out from under the person's hands.
// The mirror kept in `state.feedback` exists so that a redraw triggered by something else (a
// `turn.complete`, another draft's own action) hands the typed text back rather than losing it.
function onSpanTextInput(state: State, host: Host, identity: string, text: string): void {
  state.feedback.set(identity, withSpanText(feedbackOf(state, identity), text))
}

function onSpanTextSubmit(state: State, host: Host, identity: string, text: string): void {
  state.feedback.set(identity, withSpanCommitted(feedbackOf(state, identity), text))
  host.invalidate()
}

function onSpanRemove(state: State, host: Host, identity: string, index: number): void {
  state.feedback.set(identity, withSpanRemoved(feedbackOf(state, identity), index))
  host.invalidate()
}

// No `host.invalidate()` here: the `Input` already shows what the person types, so redrawing on
// every keystroke is wasted work, and it can move the cursor out from under the person's hands.
// The mirror kept in `state.feedback` exists so that a redraw triggered by something else (a
// `turn.complete`, another draft's own action) hands the typed text back rather than losing it.
function onWholeTextInput(state: State, host: Host, identity: string, text: string): void {
  state.feedback.set(identity, withWholeText(feedbackOf(state, identity), text))
}

function onWholeTextSubmit(state: State, host: Host, identity: string, text: string): void {
  state.feedback.set(identity, withWholeCommitted(feedbackOf(state, identity), text))
  host.invalidate()
}

function onWholeRemove(state: State, host: Host, identity: string): void {
  state.feedback.set(identity, withWholeRemoved(feedbackOf(state, identity)))
  host.invalidate()
}

// The real element types, so the typecheck refuses a prop the engine would refuse. One unknown
// prop drops the whole tree with no message. `Text` takes no `key`.
type Ui = Pick<Elements['terminal'], 'Box' | 'Button' | 'Text' | 'Input' | 'Client'>

function commentRowOf(ui: Ui, key: string, quote: string, comment: string, onRemove: () => void): RenderElement {
  const { Box, Button, Text } = ui
  return Box({
    key,
    flexDirection: 'row',
    columnGap: 1,
    children: [Button({ key: `${key}:remove`, label: 'x', onPress: onRemove }), Text({ dimColor: true, children: `> ${quote}` }), Text({ children: comment })],
  })
}

// The rows drawn right under segment `k`: one per committed span anchored on its last line, in
// ascending `start` order, then the pending selection's own quote and `Input` when it is
// anchored there too. A span keeps its index into `feedback.spans` for its key and its `onRemove`
// closure, even sorted here into a different display order, so removing one still removes the
// right one.
function segmentRowsOf(ui: Ui, key: string, draft: Draft, lines: readonly string[], segment: Segment, feedback: Feedback, state: State, host: Host, identity: string): RenderElement[] {
  const { Box, Text, Input } = ui
  const rows: RenderElement[] = feedback.spans
    .map((span, spanIndex) => ({ span, spanIndex }))
    .filter(({ span }) => anchorLineOf(lines, span) === segment.lastLine)
    .sort((a, b) => a.span.start - b.span.start)
    .map(({ span, spanIndex }) =>
      commentRowOf(ui, `${key}:c${spanIndex}`, shortQuoteOf(draft.body, span), span.comment, () => onSpanRemove(state, host, identity, spanIndex)),
    )

  const selection = feedback.selection
  if (selection !== null && anchorLineOf(lines, selection) === segment.lastLine) {
    rows.push(
      Box({
        key: `${key}:span-input-row`,
        flexDirection: 'column',
        children: [
          Text({ dimColor: true, children: `> ${shortQuoteOf(draft.body, selection)}` }),
          Input({
            key: `${key}:span-input`,
            label: 'comment',
            placeholder: 'Enter adds it; empty Enter drops the span',
            value: feedback.spanText,
            autoFocus: true,
            onInput: (value) => onSpanTextInput(state, host, identity, value),
            onSubmit: (value) => onSpanTextSubmit(state, host, identity, value),
          }),
        ],
      }),
    )
  }
  return rows
}

function draftBoxOf(ui: Ui, index: number, openDraft: OpenDraft, state: State, host: Host): RenderElement {
  const { Box, Button, Text, Input, Client } = ui
  const { draft, isDuplicate } = openDraft
  const identity = identityOf(draft)
  const feedback = feedbackOf(state, identity)
  const key = `d${index}`

  const children: RenderElement[] = [Text({ bold: true, children: `D${draft.number} ${draft.title}` })]
  if (isDuplicate) children.push(Text({ color: 'yellow', children: 'duplicate number' }))

  if (draft.file !== null) {
    children.push(Text({ dimColor: true, children: `file: ${draft.file}` }))
    const readError = state.readErrors.get(identity)
    if (readError !== undefined) {
      children.push(Text({ color: 'red', children: `cannot read the file: ${readError}` }))
      return Box({ key, flexDirection: 'column', rowGap: 1, children })
    }
    if (draft.body === '') {
      children.push(Text({ children: 'the file is empty' }))
      return Box({ key, flexDirection: 'column', rowGap: 1, children })
    }
  }

  const lines = draft.body.split('\n')
  const segments = segmentsForDraft(draft, feedback)
  const selection = feedback.selection

  segments.forEach((segment, k) => {
    const armedRange = selection === null ? null : toLocal(segment, selection)
    children.push(
      Client({
        key: `${key}:seg${k}`,
        // A string literal, not a constant: the validator reads a Client's `module` statically
        // and refuses any indirection, so the path is spelled out here rather than named once.
        module: './draft-selection.ts',
        props: { lines: segment.lines, ...(armedRange === null ? {} : { armedRange }) },
        width: '100%',
      }),
    )
    children.push(
      Box({
        key: `${key}:seg${k}:rows`,
        flexDirection: 'column',
        children: segmentRowsOf(ui, key, draft, lines, segment, feedback, state, host, identity),
      }),
    )
  })

  if (feedback.whole !== null) {
    const whole = feedback.whole
    children.push(
      Box({
        key: `${key}:whole`,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Button({ key: `${key}:whole:remove`, label: 'x', onPress: () => onWholeRemove(state, host, identity) }),
          Text({ children: `(whole draft) ${whole}` }),
        ],
      }),
    )
  }

  children.push(
    Box({
      key: `${key}:whole-input-row`,
      children: [
        Input({
          key: `${key}:whole-input`,
          label: 'whole draft',
          placeholder: 'comment on the whole draft',
          value: feedback.wholeText,
          onInput: (value) => onWholeTextInput(state, host, identity, value),
          onSubmit: (value) => onWholeTextSubmit(state, host, identity, value),
        }),
      ],
    }),
  )

  const n = commentCountOf(feedback)
  children.push(
    Box({
      key: `${key}:actions`,
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Button({
          key: `${key}:approve`,
          label: 'Approve',
          onPress: () => {
            approve(state, host, draft).catch((error: unknown) => host.log(`submit failed: ${messageOf(error)}`))
          },
        }),
        Button({
          key: `${key}:submit`,
          label: 'Submit',
          onPress: () => {
            submit(state, host, draft).catch((error: unknown) => host.log(`submit failed: ${messageOf(error)}`))
          },
        }),
        Text({ dimColor: true, children: n === 1 ? '1 comment' : `${n} comments` }),
      ],
    }),
  )

  return Box({ key, flexDirection: 'column', rowGap: 1, children })
}

// Nothing here reads `state.host` beyond what the caller already resolved into `ui` and `host`:
// the render hook itself is the only place allowed to touch `$` (through `$.ui.resolve`), and
// this function draws from `state` alone, per the module's own rule against reading the
// transcript from `ui.render`. `bodyColumns` and `bodyRows` are the render input's own body
// size, passed down for the "no open drafts" line alone: centering it takes a Box as large as
// the body to center inside, and the size to make one is only ever in the render input, never
// in state.
function paneOf(ui: Ui, state: State, host: Host, bodyColumns: number, bodyRows: number): RenderElement {
  const { Box, Text } = ui
  const visible = visibleOf(state)
  if (visible.length === 0) {
    // A first frame may report 0 for either before the surface has measured the pane; centering
    // into a zero-sized Box would draw nothing, so this falls back to the plain line instead.
    if (bodyColumns <= 0 || bodyRows <= 0) return Text({ children: 'no open drafts' })
    return Box({
      key: 'empty',
      width: bodyColumns,
      height: bodyRows,
      justifyContent: 'center',
      alignItems: 'center',
      children: [Text({ dimColor: true, children: 'no open drafts' })],
    })
  }

  return Box({
    key: PANE_ID,
    flexDirection: 'column',
    rowGap: 1,
    children: visible.map((openDraft, index) => draftBoxOf(ui, index, openDraft, state, host)),
  })
}

export function register(on: On) {
  const state: State = {
    host: null,
    isOpen: false,
    wantsOpen: false,
    open: [],
    cwd: '',
    feedback: new Map(),
    sent: new Set(),
    isSubmitting: false,
    readErrors: new Map(),
  }

  on('session.start', async ($, e, next) => {
    state.host = hostOf($)
    state.cwd = e.cwd
    await state.host.register().catch((error: unknown) => {
      state.host?.log(`/${COMMAND} is not available: ${messageOf(error)}`)
    })
    const stored = await state.host.storeGet(STORE_KEY).catch(() => undefined)
    state.wantsOpen = stored === true
    // `reparse` runs first, so whether to open (there is a draft to show) is decided from this
    // session's own transcript, not just the flag; `openIfWanted` inside it is what actually
    // opens the pane, without focus, when that is warranted.
    await reparse(state)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    void reparse(state)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const host = state.host
    if (host === null) return next(e)

    if (state.isOpen) {
      await host.close()
      state.isOpen = false
      state.wantsOpen = false
      await host.storeSet(STORE_KEY, false)
      return { text: 'draft-pane hidden' }
    }

    // Opens even with zero drafts: the person asked outright, unlike the automatic open in
    // `openIfWanted`, which only ever opens where there is something to show.
    await host.open(true)
    state.isOpen = true
    state.wantsOpen = true
    await host.storeSet(STORE_KEY, true)
    await reparse(state)
    return { text: 'draft-pane shown' }
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    const host = state.host
    if (result.deny === undefined && host !== null) {
      state.isOpen = false
      state.wantsOpen = false
      await host.storeSet(STORE_KEY, false)
      updateStatus(state)
    }
    return result
  })

  // A draft-selection.ts Client posted this on a drag's release ('client' origin: code sent it,
  // on nobody's behalf, so `data` is input to validate, never a fact). Its `element` key is
  // `d${index}:seg${k}` (set in `draftBoxOf`): `index` addresses `visibleOf(state)` — the same
  // order the pane drew it in — and `k` addresses that draft's own segments, recomputed here from
  // its feedback with the same `segmentsForDraft` `draftBoxOf` drew from, so the two sides agree
  // on what segment `k` means. A posted range is local to that segment's own text; `toAbsolute`
  // is what turns it into the offsets `Feedback.selection` keeps.
  on('ui.message', { requestId: PANE_ID }, async ($, e, next) => {
    const host = state.host
    if (host === null) return next(e)
    const elementMatch = /^d(\d+):seg(\d+)$/.exec(e.element)
    if (elementMatch === null) return next(e)
    const openDraft = visibleOf(state)[Number(elementMatch[1])]
    if (openDraft === undefined) return next(e)
    const message = selectionMessageOf(e.data)
    if (message === null) return next(e)

    const identity = identityOf(openDraft.draft)
    const feedback = feedbackOf(state, identity)
    const segment = segmentsForDraft(openDraft.draft, feedback)[Number(elementMatch[2])]
    if (segment === undefined) return next(e)
    const absolute = message.type === 'selected' ? toAbsolute(segment, { start: message.start, end: message.end }) : null
    const selection = absolute === null ? null : withoutTrailingNewlinesOf(openDraft.draft.body, absolute)
    state.feedback.set(identity, withSelection(feedback, selection))
    host.invalidate()

    if (message.type === 'selected') {
      // `autoFocus` only places the ring once a site already holds the keyboard; a drag does
      // not give the pane the keyboard by itself. The open-with-focus request below is what
      // does: a mouse drag over the pane is the person's own act, so asking for the keyboard
      // right here, right after it, is the moment the surface grants the request (a pane opened
      // with `focus` gets it while the composer is empty). The `host.focus` call after that is
      // what then puts the ring on the comment `Input` itself.
      try {
        await host.open(true)
      } catch (error) {
        host.log(`focus: open failed: ${messageOf(error)}`)
      }
      await focusSpanInput(host, `d${elementMatch[1]}:span-input`)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || state.host === null) return next(e)
    if (e.surface !== 'terminal') return next(e)
    const { Box, Button, Text, Input, Client } = await $.ui.resolve(e)
    return paneOf({ Box, Button, Text, Input, Client }, state, state.host, e.props.bodyColumns, e.props.scroll.bodyRows)
  })
}
