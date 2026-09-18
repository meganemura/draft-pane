# 0003. Three kinds of feedback, and a copied drag module

- Status: accepted
- Date: 2026-09-18

## Context

The person wants to point at words, not at a line number. The declarative Pane tree (`Box`,
`Text`, `Button`, `Input`) has no selection event. The `Client` surface hands its module raw
pointer events and holds the pointer for a whole drag. pull-request-pane already built such a
module, `description-selection.ts`, with the display-width handling for wide characters, the
first-frame `columns === 0` case, and the `surface.post` of a character range. The validator
admits one hooks module per plugin and no import across plugins.

## Decision

Three kinds of feedback. A span comment: drag over the body; a quote line and an `Input` appear
under the draft; Enter adds `{ start, end, comment }`; any number of them; each row has an `x`
button. The span `Input` sits under a line that shows the quote, with the label `comment`,
because the quote as a label wrapped in a narrow pane. A whole-draft comment: one `Input` always
under the draft, Enter adds it, a second Enter replaces it. Approve: a button that sends
approval, the path for zero comments.

The drag is `draft-selection.ts`, a copy of pull-request-pane's module with the names changed and
the `bold` prop removed; a shared library was rejected because the plugin boundary allows no
shared import, and a copy keeps each plugin's gates self-contained. The `Client` draws the body
itself, because a highlight must be drawn inside the text.

Each `Input` mirrors its text into `state.feedback` on every change and receives it back as
`value` on every redraw, so a redraw caused by a finished turn cannot wipe what the person typed.
`onInput` skips `host.invalidate()`; the `Input` already shows what was typed, so a redraw on
every keystroke is wasted work that can move the cursor under the person's hands.

## Consequences

- `claude plugin test`'s kit on 2.1.273 cannot type into an `Input`, drive a `Client`'s pointer,
  or raise `ui.message`. The drag module is tested through a hand-rolled surface double
  (`plugin/tests/draft-selection.test.ts`), the feedback transitions as pure functions
  (`plugin/tests/feedback.test.ts`), and the Approve path end to end. Submit with comments is
  covered only at the formatter level and by the real-terminal round.
- Two copies of the drag module now exist; a fix in one must be carried to the other by hand.
- Committed spans are listed under the body with their quote; they are not highlighted inside the
  body.
- Tried in a real terminal: a drag over an English span and over a Japanese span each highlighted
  the exact characters, and text typed into an input survived a redraw caused by a second drag.
