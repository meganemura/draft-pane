# 0004. Feedback is one prompt that quotes each span

- Status: accepted
- Date: 2026-09-18

## Context

The person's rule is that nothing lives only in the pane. A prompt that said "the second
sentence" would need the pane to be understood. `prompt.fill` replaces the whole prompt box and
cannot read what is there, so it cannot append.

## Decision

Submit sends one prompt through `$.prompt.submit`: the header `Feedback (draft-pane) on D<n>:`,
then for each span, in the order it appears in the draft, the exact selected text with `> ` on
every line, then the comment on the next line, then `(whole draft) <comment>` when there is one.
Approve sends the header then `(approved)`.

Guards, from grilling-pane's decision 0005: Submit sends nothing while a submit is in flight;
Submit with zero comments sends nothing and sets a status line; Approve with comments pending
sends nothing and sets a status line, because pressing Approve with comments waiting is more
likely a slip than a choice; Submit or Approve with unsent text in an Input sends nothing and
sets a status line, because text not yet added by Enter would be lost without a word; a sent
draft goes into process memory and stays out of the pane even when `turn.complete` fires before
the feedback lands in the transcript; a `drop` result leaves every comment where it was.

## Consequences

- The prompt alone says what each comment is about; the model reads the quoted span and finds it
  in its own block.
- The sent memory is process memory only; a fresh session reads the answer from the transcript.
- A person who wants to approve and comment at once removes the comments or writes the wish as a
  whole-draft comment.
