// Tests for the plain functions in hooks/block.ts: no `$`, no hooks, just the ```draft block
// parser and the feedback-line formatter.

import type { SessionMessage } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

import {
  APPROVED,
  approvalTextOf,
  draftsOf,
  feedbackNumbersOf,
  feedbackTextOf,
  headerOf,
  openDraftsOf,
} from '../hooks/block'

tier('user')

function assistant(text: string): SessionMessage {
  return { role: 'assistant', text, toolUses: [] }
}

function user(text: string): SessionMessage {
  return { role: 'user', text, toolUses: [] }
}

describe('draftsOf', () => {
  test('parses a header and a body', () => {
    const text = ['```draft', 'D3: a made-up library\'s README', '## Install', '', 'Run the two commands below.', '```'].join('\n')

    expect(draftsOf(text)).toEqual([
      {
        number: 3,
        title: "a made-up library's README",
        body: '## Install\n\nRun the two commands below.',
        revises: null,
      },
    ])
  })

  test('a header naming what it revises sets `revises`', () => {
    const text = ['```draft', 'D4 (revises D3): a shorter Install section', 'one line body', '```'].join('\n')

    expect(draftsOf(text)).toEqual([
      { number: 4, title: 'a shorter Install section', body: 'one line body', revises: 3 },
    ])
  })

  test('text outside a block is ignored', () => {
    const text = ['some prose before', 'D9: not a block, just text', '```draft', 'D3: title', 'body', '```', 'prose after'].join('\n')

    expect(draftsOf(text)).toEqual([{ number: 3, title: 'title', body: 'body', revises: null }])
  })

  test('a block whose first line is not a header is dropped', () => {
    const text = ['```draft', 'not a header line', 'body', '```'].join('\n')

    expect(draftsOf(text)).toEqual([])
  })

  test('leading and trailing blank lines are removed but an inner blank line stays', () => {
    const text = ['```draft', 'D1: title', '', '', 'first line', '', 'second line', '', '```'].join('\n')

    expect(draftsOf(text)[0]?.body).toBe('first line\n\nsecond line')
  })

  test('a four-backtick block keeps a three-backtick fence line inside it as body text', () => {
    const text = ['````draft', 'D5: a commit message with an example fence', 'Before running:', '```', 'npm test', '```', 'That is the whole example.', '````'].join(
      '\n',
    )

    expect(draftsOf(text)).toEqual([
      {
        number: 5,
        title: 'a commit message with an example fence',
        body: 'Before running:\n```\nnpm test\n```\nThat is the whole example.',
        revises: null,
      },
    ])
  })

  test('two blocks in one message return two drafts', () => {
    const text = ['```draft', 'D1: first', 'body one', '```', 'some prose in between', '```draft', 'D2: second', 'body two', '```'].join('\n')

    expect(draftsOf(text)).toEqual([
      { number: 1, title: 'first', body: 'body one', revises: null },
      { number: 2, title: 'second', body: 'body two', revises: null },
    ])
  })

  test('an unclosed block runs to the end of the text', () => {
    const text = ['```draft', 'D1: title', 'body line one', 'body line two'].join('\n')

    expect(draftsOf(text)).toEqual([{ number: 1, title: 'title', body: 'body line one\nbody line two', revises: null }])
  })
})

describe('feedbackNumbersOf', () => {
  test('found in a user message', () => {
    const text = ['Feedback (draft-pane) on D3:', '> some quoted text', 'a comment'].join('\n')

    expect(feedbackNumbersOf(text)).toEqual([3])
  })

  test('the same header inside an assistant message is not counted by openDraftsOf', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D1: a made-up library\'s README', 'body text', '```'].join('\n')),
      assistant(['Feedback (draft-pane) on D1:', APPROVED].join('\n')),
    ]

    const open = openDraftsOf(messages)

    expect(open).toHaveLength(1)
    expect(open[0]?.draft.number).toBe(1)
  })
})

describe('openDraftsOf', () => {
  test('a draft in an older assistant message is stale once a later message has any draft', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D3: an older take', 'body three', '```'].join('\n')),
      assistant(['```draft', 'D5: a newer take', 'body five', '```'].join('\n')),
    ]

    const open = openDraftsOf(messages)

    expect(open.map((od) => od.draft.number)).toEqual([5])
  })

  test('D3 and D4 (revises D3) in the same message: only D4 is open', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D3: first take', 'run it', '```', '```draft', 'D4 (revises D3): shorter take', 'run it, shorter', '```'].join('\n')),
    ]

    const open = openDraftsOf(messages)

    expect(open.map((od) => od.draft.number)).toEqual([4])
  })

  test('a draft revised by a later one is not open; only the revision is (two messages)', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D3: first take on the Install section', 'run it', '```'].join('\n')),
      assistant(['```draft', 'D4 (revises D3): a shorter take', 'run it, shorter', '```'].join('\n')),
    ]

    const open = openDraftsOf(messages)

    expect(open.map((od) => od.draft.number)).toEqual([4])
  })

  test('feedback on the newest draft in a later user message leaves zero open', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D5: a draft', 'body', '```'].join('\n')),
      user(['Feedback (draft-pane) on D5:', APPROVED].join('\n')),
    ]

    expect(openDraftsOf(messages)).toEqual([])
  })

  test('two different drafts sharing a number in the same message are both open and both marked duplicate', () => {
    const messages: SessionMessage[] = [
      assistant(
        ['```draft', 'D5: a commit message, first wording', 'fix the thing', '```', '```draft', 'D5: a commit message, second wording', 'fix the other thing', '```'].join(
          '\n',
        ),
      ),
    ]

    const open = openDraftsOf(messages)

    expect(open).toHaveLength(2)
    expect(open.every((od) => od.isDuplicate)).toBe(true)
  })

  test('two assistant messages where the last has no block: the earlier one\'s drafts are open', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D3: a draft', 'body three', '```'].join('\n')),
      assistant('a plain answer with no block'),
    ]

    const open = openDraftsOf(messages)

    expect(open.map((od) => od.draft.number)).toEqual([3])
  })

  test('the same block repeated twice in one message yields one open draft', () => {
    const block = ['```draft', 'D2: a made-up paragraph', 'the same body both times', '```'].join('\n')
    const messages: SessionMessage[] = [assistant([block, block].join('\n'))]

    const open = openDraftsOf(messages)

    expect(open).toHaveLength(1)
    expect(open[0]?.isDuplicate).toBe(false)
  })

  test('a draft with a smaller number written later still sorts first', () => {
    const messages: SessionMessage[] = [
      assistant(['```draft', 'D9: written first', 'body nine', '```', '```draft', 'D2: written second', 'body two', '```'].join('\n')),
    ]

    const open = openDraftsOf(messages)

    expect(open.map((od) => od.draft.number)).toEqual([2, 9])
  })
})

describe('feedbackTextOf and approvalTextOf', () => {
  const draft = { number: 3, title: "a made-up library's README", body: 'Run the two commands below.\nthe second one installs the plugin', revises: null }

  test('two span comments plus one whole comment produce the exact text, spans sorted by start', () => {
    const spans = [
      { start: 28, end: 62, comment: '「the plugin」ではなく plugin 名を書く' },
      { start: 0, end: 27, comment: '1 文にまとめてよい。「below」は要らない' },
    ]

    expect(feedbackTextOf(draft, spans, '全体にもう少し短く')).toBe(
      [
        'Feedback (draft-pane) on D3:',
        '> Run the two commands below.',
        '1 文にまとめてよい。「below」は要らない',
        '> the second one installs the plugin',
        '「the plugin」ではなく plugin 名を書く',
        '(whole draft) 全体にもう少し短く',
      ].join('\n'),
    )
  })

  test('a span-only feedback has no "(whole draft)" line', () => {
    const spans = [{ start: 0, end: 27, comment: 'a comment' }]

    expect(feedbackTextOf(draft, spans, null)).toBe([headerOf(draft), '> Run the two commands below.', 'a comment'].join('\n'))
  })

  test('a span over text containing CJK characters is quoted as the exact substring', () => {
    const cjkDraft = { number: 7, title: 'タイトル', body: 'これはテストです。', revises: null }
    const spans = [{ start: 3, end: 6, comment: 'ここを直して' }]

    expect(feedbackTextOf(cjkDraft, spans, null)).toBe([headerOf(cjkDraft), '> テスト', 'ここを直して'].join('\n'))
  })

  test('a span that includes a newline puts "> " on each quoted line', () => {
    const multilineDraft = { number: 8, title: 'title', body: 'line one\nline two', revises: null }
    const spans = [{ start: 0, end: multilineDraft.body.length, comment: 'a comment on both lines' }]

    expect(feedbackTextOf(multilineDraft, spans, null)).toBe([headerOf(multilineDraft), '> line one', '> line two', 'a comment on both lines'].join('\n'))
  })

  test('approvalTextOf produces the header then "(approved)"', () => {
    expect(approvalTextOf(draft)).toBe('Feedback (draft-pane) on D3:\n(approved)')
  })
})
