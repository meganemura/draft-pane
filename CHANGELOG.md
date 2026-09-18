# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
stable release yet: version numbers may still change shape between releases.

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
