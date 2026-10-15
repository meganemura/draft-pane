# 0008. The pane draws on Claude Code Desktop

- Status: accepted; on the desktop, 0009 replaces the shared tree
- Date: 2026-10-15

## Context

Since Claude Code 2.1.287, mods load by default, and the Code tab of Claude Code Desktop draws
a mod's `Pane` on the `desktop` surface. The render hook drew only when `e.surface` was
`terminal` and passed every other surface to `next(e)`. On the desktop, the pane opened with
no draft in it.

The desktop's element table has `Box`, `Button`, `Text`, `Input` and `Client`, with the same
props as the terminal's. A desktop `Client` gets pointer events in cells of its region, as the
terminal gives them, so `draft-selection.ts` needs no change. The mobile app's table has no
`Input` and no `Client`.

## Decision

- The render hook draws the same tree on `terminal` and `desktop`. `Ui` is typed with
  `Elements['terminal' | 'desktop']`. Other surfaces still go to `next(e)`.
- CI moves from Claude Code 2.1.273 to 2.1.280, the version grilling-pane pins. Its test kit has
  `$.ui.mount`, which draws the pane on a named surface and drives a `Client`'s pointer. 2.1.280
  is 23 days old today. The `ui.open` stub of the tests answers `{ isPlaced: true }`, as the
  2.1.280 declarations require.

## Consequences

- Tests render the pane on both surfaces and compare the trees. One test drags over a line on the
  desktop, types a comment, presses Submit, and checks the quoted span in the prompt.
- How the desktop paints the region (its font, its cell width, wide characters) was not checked
  in the real app. The test kit checks the tree and the cells, not the paint.
