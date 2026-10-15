# 0009. The desktop draws its own tree

- Status: accepted
- Date: 2026-10-15

## Context

0008 made the desktop draw the same tree as the terminal. The desktop can draw more than the
terminal: `Svg` (a vector picture; with `isInteractive`, hover and `<title>` tooltips work),
`Markdown`, `Code` (syntax colors, and unified-diff hunks under `format: 'diff'`), native buttons,
and borders that a hover can color. The terminal has none of `Svg`, and draws `Markdown` and
`Code` in cells. The owner asked for a desktop pane that uses these elements.

## Decision

- On the `desktop` surface, the render hook draws the tree of `hooks/desktop.ts`. The terminal
  tree in `mod.ts` does not change.
- `desktop.ts` gets each draft as data and closures (`DesktopDraft`) from `mod.ts`. The closures
  call the same transitions as the terminal buttons and inputs. So Submit, Approve and the
  feedback prompt are the same on both surfaces.
- The `Client` (`draft-selection.ts`), the segment cut, and the keys of the `Client`s, the comment
  inputs, `Approve` and `Submit` are the same as on the terminal. The `ui.message` handler and
  the focus calls need no second case.
- Each draft is a card: a header with the number, the title and the counts; a trail of the
  drafts that it revises (`Svg`); a bar that shows where the comments fall (`Svg`, one `<title>`
  for each comment); and three views.
  - `Comment`: the text to drag over, with each comment as a card under the line it ends on.
  - `Preview`: `Markdown` of the body, or `Code` for a file draft that is not markdown or text.
  - `Changes`: the diff against the draft that this one revises, from `hooks/diff.ts` (a line
    diff, written as `diff -u` hunks).
- Each draft's view is in `state.views` by identity, so a redraw keeps it.
- `reparse` keeps every draft of the transcript by number (`state.history`), for the trail and
  the diff.
- The SVG markup carries its own colors, with a light and a dark set by `prefers-color-scheme`,
  because the desktop draws an `Svg` as an image or in a frame, outside its own page styles.

## Consequences

- A file draft has no `Changes` view: the transcript does not keep the earlier text of a file.
- `Markdown` and `Code` take at most 10,000 characters. A longer body is cut at a line break, and
  a line tells the person that the `Comment` view shows all of it.
- CI stays on Claude Code 2.1.280. Its declarations have `Svg`, `Markdown` and `Code`, but not the
  `Text` `size` and `weight` props or the desktop `primary` button (2.1.299 and later). These are
  less than 7 days old today, so they wait for a later pin.
- The test kit checks the tree, the presses and the posts on a mounted desktop pane. How the
  desktop paints the cards, the `Svg`s and the diff was not checked in the real app.
