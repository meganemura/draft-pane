# 0001. Drafts live in a fenced block

- Status: accepted
- Date: 2026-09-18

## Context

The model writes a draft as ordinary text in its answer. The pane needs one fixed place to read
a draft from. A person reading the transcript later needs to find "D3" without searching the
text.

A YAML or JSON block can carry the same fields, but it reads as code to a person scanning the
transcript, and it competes with the model's own explanation of the draft.

## Decision

A draft is a fenced code block labeled `draft`. The first line is `D<n>: <title>`; the rest of
the block is the draft itself:

```draft
D3: README, the Install section
## Install

Run the two commands below. The first one adds the marketplace, the second one installs the plugin.
```

Numbers run in one sequence for the whole conversation and are never reused. A revision is a new
block with a new number, its first line `D<m> (revises D<n>): <title>`, never a rewrite of the
old block in place: a later comment names "D3", and that name must keep one meaning for the rest
of the conversation.

A draft that itself contains a three-backtick fence goes inside a four-backtick block. The parser
accepts an opener of three or more backticks and a closer at least as long as the opener. Leading
and trailing blank lines of the body are removed once, at parse time, so the body string the pane
draws is the same string the feedback formatter slices to build a quote.

## Consequences

- Every draft the pane shows is plain text in the transcript, readable with the plugin
  uninstalled.
- The parser reads plain text only. It never parses YAML or JSON.
- A block with no closing fence still parses: it runs to the end of the message.
