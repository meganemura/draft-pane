# 0002. Open drafts come from the transcript

- Status: accepted
- Date: 2026-09-18

## Context

The pane has to know which drafts still wait for feedback. That set changes with a new assistant
message (a new draft, or a revision) and with a new user message (feedback). Reading
`$.session.messages()` from the render hook would run it on every redraw, several times a second.

## Decision

The module reads the transcript on `session.start`, on `turn.complete`, and when `/draft-pane`
opens the pane, and keeps the result in state; the render hook draws from that state only.

Only the last assistant message that holds a `draft` block supplies candidates for "open".
Without that rule, a draft the person never answered — an older topic, or one answered in plain
words instead of from the pane — would stay open forever, next to whatever the model just wrote.
An older draft is still readable in the transcript, and the model can post it again under a new
number.

Feedback lines are read from every user message in the transcript, because a feedback prompt for
the newest draft can sit anywhere after it. Feedback lines are read from user messages only,
because an assistant message may quote the header back when it discusses past feedback. `revises`
is read from every draft in every assistant message, not only the newest one's, because the
newest message can itself carry both a draft and the revision that replaces it. A draft is open
when no feedback line names its number and no other draft revises it. Two open drafts that share
a number are both drawn with a
`duplicate number` mark, so the model's numbering mistake stays visible, and one feedback line
closes both.

The store keeps one flag, `wantsOpen`, as grilling-pane does: the pane opens without focus when a
session starts with an open draft, or when a finished turn brings one, until the person hides it.

## Consequences

- The pane's state can be thrown away and rebuilt from the transcript, which is what makes hot
  reload and `--continue` work.
- The pane shows the newest message's drafts only. A draft from an earlier turn is gone once any
  later assistant message posts a `draft` block, answered or not.
- `session.messages()` returns the newest 4096 messages, so a draft older than that leaves the
  pane; the model can post it again under a new number.
- A person who used the pane once gets it again in every later session, in any directory, until
  they hide it.
- Tried in a real terminal: after Submit, the model's revision replaced the original in the pane,
  and after Approve the pane drew "no open drafts".
