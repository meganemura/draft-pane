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

2026-09-18 (second entry): the body is drawn as a column of segments instead of one `Client` for
the whole body, so a comment and its input sit right under the line they belong to, as a review
comment in an editor does. `segments.ts` cuts `body.split('\n')` at each anchor line — the line
holding the last character of a committed span, or of the pending selection — into segments:
segment `k` holds the lines after the previous anchor up to and including anchor `k`; a trailing
segment holds whatever is left. Each segment gets its own `draft-selection.ts` `Client`, keyed
`d${i}:seg${k}`, drawing only that segment's own lines; a posted range is local to the segment,
and `segments.ts`'s `toAbsolute` and `toLocal` are the only place an offset crosses between that
local text and the whole body. Right under each segment: the committed spans anchored there, in
ascending `start` order, then the pending selection's quote and `Input` when it is anchored there
too. The whole-draft `Input` and the `Approve`/`Submit` row still sit under the last segment.

2026-09-19: the whole-draft `Input` opens on a `whole draft` button press, instead of sitting on
screen from the start of every render. A real-terminal round measured that, while the pane held
that `Input` from the first frame, no mouse event reached Claude Code at all, in the pane or in
the transcript; closing the pane restored the mouse. grilling-pane's pane, which draws only
`Button` and `Text`, showed nothing of the kind. The button sets `Feedback.wholeOpen`, asks for
the keyboard, and moves the ring onto the `Input` the same way a drag does onto the span one;
Enter closes the field again, sent or not, so at most one draft's whole-draft `Input` is ever
drawn. The span `Input` keeps its own behavior: it is drawn right after a drag and disappears on
Enter, never on screen before a selection exists.

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
- 2026-09-18 (second entry): a drag cannot cross a segment boundary, because the `Client` holds
  the pointer for one segment only. The person selects within the lines between two comments, not
  across a line that already carries one; accepted as the plugin's stated limit, not worked
  around.
- 2026-09-18 (second entry): removing a comment drops its span from `Feedback.spans`, so its
  anchor line disappears from the next `segmentsOf` call and that segment merges back into its
  neighbor on the next redraw. No extra code keeps the two in sync; recomputing segments from
  `feedback` on every draw does it for free.
- 2026-09-19: the cause of the lost mouse events is not yet known — only that it correlates with
  an `Input` present before any typing starts. If a later terminal round finds the same loss with
  the button in place, the cause is something else and this decision should be revisited.
