# 0007. A draft block may name a file instead of carrying the text

- Status: accepted
- Date: 2026-09-19

## Context

A person asked to review a note that already existed as a file, 31 KB, 360 lines. The skill made
the model copy the whole text into a `draft` block: it wasted tokens and the copy did not fit in
one output.

## Decision

The line right after the header, `file: <path>`, makes the draft a file draft: the pane reads
that file, not the block, for the body. Any further lines in the block are ignored, and a file
draft is kept even with no body text. The pane rereads the file on every reparse, so it always
shows what is on disk as of the newest parse. The prompt a Submit or Approve press sends carries
the same `file:` line right after the header, so a person reading the prompt later knows which
file the quotes came from without going back to the block. The model revises a file draft by
editing the file, then posting a new block with the new number, `(revises D<n>)`, and the same
`file:` line.

The path is absolute, or relative to the session's working directory. There is no `~` expansion:
the hooks environment has no home directory to expand it against, and the skill tells the model
to write an absolute path.

## Consequences

- A file draft's text is no longer in the transcript; only the quotes a person sent as feedback
  are. A person reading the transcript with the plugin uninstalled sees the `file:` path and the
  quoted spans, not the draft itself.
- A file that changes between the pane's read and the person's Submit sends quotes that point at
  the text the person actually saw, not the file's newest content.
- The draft's identity is `${number}\n${title}\n${body}` (unchanged), so a changed file gives a
  new identity once reread: a comment always quotes the text that was on screen when it was
  written.
