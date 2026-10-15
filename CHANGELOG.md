# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
stable release yet: version numbers may still change shape between releases.

## [Unreleased]

### Added

- The pane draws in the Code tab of Claude Code Desktop, the drag-to-comment `Client` included.
  Before, the desktop showed the pane with nothing in it.
- On Claude Code Desktop, the pane draws a richer tree than on the terminal. Each draft is a card
  with its number, title and line, word and character counts. A `Preview` view draws the draft as
  markdown, or a code file with syntax colors. A revision shows its trail of earlier drafts and a
  `Changes` view with the diff against the draft that it revises. A bar shows where the comments
  fall in the draft, with each comment as a tooltip. Comments are cards with a `Remove` button. A
  file draft links to its file. The terminal pane does not change.

## [0.4.0] - 2026-09-19

### Changed

- The whole-draft comment field opens from a `whole draft` button, instead of being drawn all the
  time. While an input field was on screen from the start, one terminal setup received no mouse
  events at all.

## [0.3.0] - 2026-09-19

### Added

- A draft block may name a file instead of carrying its text: a `file:` line right after the
  header. The pane rereads the file on every reparse, and Submit and Approve send the same
  `file:` line so the prompt names the file the quotes came from.

## [0.2.0] - 2026-09-18

### Changed

- Comments and the comment input sit right under the line they belong to; a selection stays
  within the lines between two comments.
- The empty pane centers its `no open drafts` line.

### Fixed

- After a drag, the comment input takes the keyboard, also when the pane opened on its own
  without it. Before, the typed comment could land in the prompt box.
- A drag released at the start of the next line no longer selects the line break.

## [0.1.0] - 2026-09-18

### Added

- The `draft-pane:draft` skill: Claude writes a requested draft inside a fenced block labeled
  `draft`, numbered `D<n>`, and posts a revision under a new number as `D<m> (revises D<n>)`.
- A pane beside the transcript that draws the drafts of the newest assistant message that holds a
  `draft` block. `/draft-pane` shows or hides it; after one show it opens on its own when a draft
  arrives.
- Span comments: drag over the draft body, type a comment under the quoted span, press Enter. Any
  number of them, each removable.
- One comment on the whole draft, and an Approve button.
- One Submit sends every comment as one prompt, `Feedback (draft-pane) on D<n>:`, that quotes
  each span with `> `. Approve sends `(approved)`.
- Guards: Submit refuses with zero comments, Approve refuses with comments pending, both refuse
  while an input holds text that Enter has not added.
- Install through a marketplace: `claude plugin marketplace add meganemura/draft-pane` then
  `claude plugin install draft-pane@draft-pane`.
