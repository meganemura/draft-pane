// Tests for the plugin's function-hooks module, run by `claude plugin test plugin` with
// `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Nothing here reaches a real transcript or model: the
// world stubs `session.messages`, `prompt.submit`, `ui.status` and the rest of what mod.ts calls
// through its `Host`, and every test drives the plugin the way the person does, through
// `$.command.run`, `$.ui.render` and `$.ui.press`.
//
// The kit has no call for `ui.message` (a draft-selection.ts Client's post reaches the hooks
// module only through the real engine), so the drag-to-comment path itself is covered in
// feedback.test.ts as the plain functions it is built from; this file covers everything that
// does not depend on it — opening, drawing, Approve and Submit.

import type { CommandRunInput, On, RenderInput, SessionMessage, TurnCompleteInput } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

tier('user')

const PLUGIN = 'draft-pane'
const COMMAND = 'draft-pane'
const STORE_KEY = 'wantsOpen'

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

const PANE: RenderInput<'Pane'> = {
  component: 'Pane',
  surface: 'terminal',
  requestId: PLUGIN,
  viewport: { columns: 120, rows: 40 },
  props: { title: PLUGIN, isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

const RUN: CommandRunInput = { command: COMMAND, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }

const TURN_COMPLETE: TurnCompleteInput = { answer: '', durationMs: 0, isAborted: false, turnId: 't1', reason: 'answer' }

function assistant(text: string): SessionMessage {
  return { role: 'assistant', text, toolUses: [] }
}

// One draft about a made-up library, with a Japanese title, in a single ```draft block.
const D3_DRAFT: SessionMessage = assistant(
  ['```draft', 'D3: 素材ライブラリの README セクション', '## Install', '', 'Run `npm install libfoo`.', '```'].join('\n'),
)

// D3 revised by D4: D3 alone becomes closed the moment D4 (which names it in its header) is
// also in the transcript, even though nothing submitted feedback on D3 directly.
const D4_REVISION: SessionMessage = assistant(
  ['```draft', 'D4 (revises D3): a made-up cache invalidation commit message, v2', 'Invalidate the loan cache on write and on delete.', '```'].join('\n'),
)

// Two drafts, same number, different bodies, both in the one message that counts under the
// newest-message rule: not one draft repeated, but two the model wrote under a clashing number.
const DUPLICATES: SessionMessage = assistant(
  [
    '```draft',
    'D1: a made-up commit message, take one',
    'Fix the cache eviction bug.',
    '```',
    '```draft',
    'D1: a made-up commit message, take two',
    'Fix a different bug in eviction.',
    '```',
  ].join('\n'),
)

type WorldOptions = {
  messages?: SessionMessage[]
  store?: Record<string, unknown>
  submit?: (text: string) => { text: string } | { drop: string }
  // Leaves `prompt.submit` with nothing answering it, so `host.submit` rejects for real (the
  // engine's own "no implementation for prompt.submit") instead of a stub simulating a failure.
  noSubmit?: boolean
}

// The world beneath the module: a transcript (replaceable, for `turn.complete`), a store seeded
// before `session.start`, and a `prompt.submit` that echoes the text back unless a test asks for
// a drop.
function world(on: On, options: WorldOptions = {}) {
  const opened: string[] = []
  const openCalls: { id: string; focus?: true }[] = []
  const closed: string[] = []
  const logged: string[] = []
  const statuses: (string | undefined)[] = []
  const submittedTexts: string[] = []
  const focusCalls: { requestId: string; key: string }[] = []
  let messages: SessionMessage[] = options.messages ?? []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.messages', () => ({ value: messages }))

  // A chain event, not a plain call: the terminal fake answers with the shape `prompt.submit`
  // itself resolves to (`{ text }` or `{ drop }`), never wrapped in `{ value }`.
  if (!options.noSubmit) {
    on('prompt.submit', ($, e) => {
      submittedTexts.push(e.text)
      return options.submit ? options.submit(e.text) : { text: e.text }
    })
  }

  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    openCalls.push({ id: e.id, ...(e.focus ? { focus: e.focus } : {}) })
    return { value: undefined }
  })
  on('ui.close', ($, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  // Not a plain call like `ui.open` above: `ui.focus` is a genuine chain event, its own core
  // already moving the ring for real over what `ui.render` drew, so the stub only records the
  // request and lets `next(e)` reach that core rather than replacing it.
  on('ui.focus', ($, e, next) => {
    focusCalls.push({ requestId: e.requestId, key: e.element ?? '' })
    return next(e)
  })

  const store = new Map<string, unknown>(Object.entries(options.store ?? {}))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })

  return {
    opened,
    openCalls,
    closed,
    logged,
    statuses,
    submittedTexts,
    focusCalls,
    store,
    setMessages: (next: SessionMessage[]) => {
      messages = next
    },
  }
}

// The strings a drawn tree carries: a Text's joined children, a Button's label.
function textOf(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(textOf).join('\n')
  if (typeof tree !== 'object' || tree === null) return ''
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Text') {
    return (Array.isArray(children) ? children : []).filter((child): child is string => typeof child === 'string').join('')
  }
  if (type === 'Button') {
    const label = typeof props === 'object' && props ? Reflect.get(props, 'label') : undefined
    return typeof label === 'string' ? label : ''
  }
  return textOf(children)
}

// The keyed Box drawn under `key` (a row, or the marker's or the Button's own wrapper inside
// one), or undefined: read here rather than searched for by content, since a Box carries no
// text of its own for `textOf` to find it by.
function boxByKey(tree: unknown, key: string): { props: Record<string, unknown>; children: unknown } | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = boxByKey(child, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof tree !== 'object' || tree === null) return undefined
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Box' && typeof props === 'object' && props !== null && Reflect.get(props, 'key') === key) {
    return { props: props as Record<string, unknown>, children }
  }
  return boxByKey(children, key)
}

// Every Button in a drawn tree, keyed.
function buttonsOf(tree: unknown): { key: string; label: string }[] {
  if (Array.isArray(tree)) return tree.flatMap(buttonsOf)
  if (typeof tree !== 'object' || tree === null) return []
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  const children: unknown = Reflect.get(tree, 'children')
  if (type === 'Button') {
    const key = typeof props === 'object' && props ? Reflect.get(props, 'key') : undefined
    const label = typeof props === 'object' && props ? Reflect.get(props, 'label') : undefined
    return [{ key: typeof key === 'string' ? key : '', label: typeof label === 'string' ? label : '' }]
  }
  return buttonsOf(children)
}

// A `Client` leaf's own `props`, read by its key out of a rendered tree (not searched for by
// content, since a Client carries no text of its own for `textOf` to find it by).
function clientPropsOf(tree: unknown, key: string): unknown {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = clientPropsOf(child, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof tree !== 'object' || tree === null) return undefined
  const type: unknown = Reflect.get(tree, 'type')
  const props: unknown = Reflect.get(tree, 'props')
  if (type === 'Client' && typeof props === 'object' && props !== null && Reflect.get(props, 'key') === key) {
    return Reflect.get(props, 'props')
  }
  const children: unknown = Reflect.get(tree, 'children')
  return clientPropsOf(children, key)
}

// A Button's `onPress` is not awaited by `$.ui.press`; it settles after a few turns of the task
// queue. `setTimeout` is reached through the global object, as the module names no host globals
// of its own.
async function settle(): Promise<void> {
  const later = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => unknown }).setTimeout
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => later(resolve, 0))
}

describe('mod', () => {
  test('/draft-pane opens the pane, and a second run hides it; the store follows', async ($, on) => {
    const kept = world(on)
    await $.session.start(SESSION)

    const shown = await $.command.run(RUN)
    expect(shown.text).toBe('draft-pane shown')
    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.store.get(STORE_KEY)).toBe(true)

    const hidden = await $.command.run(RUN)
    expect(hidden.text).toBe('draft-pane hidden')
    expect(kept.closed).toEqual([PLUGIN])
    expect(kept.store.get(STORE_KEY)).toBe(false)
  })

  test('wanting the pane open, with a draft already in the transcript, opens it at session.start, without focus', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [D3_DRAFT] })

    await $.session.start(SESSION)

    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.openCalls.at(-1)?.focus).toBeUndefined()

    const tree = await $.ui.render(PANE)
    expect(textOf(tree)).toContain('D3 素材ライブラリの README セクション')
    expect(clientPropsOf(tree, 'd0:seg0')).toEqual({ lines: ['## Install', '', 'Run `npm install libfoo`.'] })
  })

  test('wanting the pane open, but no draft yet, does not open it', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [] })

    await $.session.start(SESSION)

    expect(kept.opened).toEqual([])
  })

  test('a draft arriving through turn.complete opens the pane without focus', async ($, on) => {
    const kept = world(on, { store: { [STORE_KEY]: true }, messages: [] })
    await $.session.start(SESSION)
    expect(kept.opened).toEqual([])

    kept.setMessages([D3_DRAFT])
    await $.turn.complete(TURN_COMPLETE)
    await settle()

    expect(kept.opened).toEqual([PLUGIN])
    expect(kept.openCalls.at(-1)?.focus).toBeUndefined()
    expect(textOf(await $.ui.render(PANE))).toContain('D3')
  })

  test('with zero open drafts, the pane draws exactly "no open drafts"', async ($, on) => {
    world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    expect(textOf(await $.ui.render(PANE))).toBe('no open drafts')
  })

  test('with no open drafts, the line centers in a Box sized to the pane body', async ($, on) => {
    world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const tree = await $.ui.render(PANE)
    const box = boxByKey(tree, 'empty')

    expect(box?.props.width).toBe(PANE.props.bodyColumns)
    expect(box?.props.height).toBe(PANE.props.scroll.bodyRows)
    expect(textOf(tree)).toBe('no open drafts')
  })

  test('a zero body size (a first frame before the surface has measured) falls back to the plain line', async ($, on) => {
    world(on, { messages: [] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const zeroPane: RenderInput<'Pane'> = { ...PANE, props: { ...PANE.props, scroll: { ...PANE.props.scroll, bodyRows: 0 } } }
    const tree = await $.ui.render(zeroPane)

    expect(boxByKey(tree, 'empty')).toBeUndefined()
    expect(textOf(tree)).toBe('no open drafts')
  })

  test('D3 and D4 (revises D3) in the transcript draw D4 only', async ($, on) => {
    world(on, { messages: [D3_DRAFT, D4_REVISION] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const text = textOf(await $.ui.render(PANE))
    expect(text).toContain('D4 a made-up cache invalidation commit message, v2')
    expect(text).not.toContain('D3 ')
  })

  test('two drafts sharing a number both draw "duplicate number"', async ($, on) => {
    world(on, { messages: [DUPLICATES] })
    await $.session.start(SESSION)
    await $.command.run(RUN)

    const text = textOf(await $.ui.render(PANE))
    expect((text.match(/duplicate number/g) ?? []).length).toBe(2)
  })

  test('pressing Approve sends the approval line; the draft leaves the pane; an unchanged turn.complete does not bring it back', async ($, on) => {
    const kept = world(on, { messages: [D3_DRAFT] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'd0:approve' })
    await settle()

    expect(kept.submittedTexts.at(-1)).toBe('Feedback (draft-pane) on D3:\n(approved)')
    expect(textOf(await $.ui.render(PANE))).toBe('no open drafts')

    await $.turn.complete(TURN_COMPLETE)
    await settle()
    expect(textOf(await $.ui.render(PANE))).toBe('no open drafts')
  })

  test('pressing Submit with zero comments sends nothing and sets the status', async ($, on) => {
    const kept = world(on, { messages: [D3_DRAFT] })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'd0:submit' })
    await settle()

    expect(kept.submittedTexts).toEqual([])
    expect(kept.statuses.at(-1)).toBe('add a comment or press Approve before Submit')
  })

  test('a drop from prompt.submit on Approve leaves the draft drawn', async ($, on) => {
    const kept = world(on, { messages: [D3_DRAFT], submit: () => ({ drop: 'refused' }) })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'd0:approve' })
    await settle()

    expect(kept.submittedTexts).toHaveLength(1)
    const tree = await $.ui.render(PANE)
    expect(textOf(tree)).toContain('D3')
    expect(buttonsOf(tree).some((button) => button.key === 'd0:approve')).toBe(true)
  })

  test('a rejected host.submit leaves the draft drawn and logs one line', async ($, on) => {
    const kept = world(on, { messages: [D3_DRAFT], noSubmit: true })
    await $.session.start(SESSION)
    await $.command.run(RUN)
    await $.ui.render(PANE)

    await $.ui.press({ plugin: PLUGIN, key: 'd0:approve' })
    await settle()

    const tree = await $.ui.render(PANE)
    expect(textOf(tree)).toContain('D3')
    expect(kept.logged.some((line) => line.startsWith("draft-pane: submit failed:"))).toBe(true)
  })

  test('a closed pane with an open draft posts a status line containing "open draft"', async ($, on) => {
    const kept = world(on, { messages: [D3_DRAFT] })
    await $.session.start(SESSION)

    expect(kept.statuses.at(-1)).toContain('open draft')
  })
})
