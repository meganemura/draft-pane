---
name: draft
description: Write a draft the person asked for (a README section, a commit message, a document paragraph, a reply) inside a draft block that draft-pane shows in a pane beside the transcript. Use it when the person asks for a draft of any text, or says "draft".
license: MIT
---

1. Write the draft inside one fenced block labeled `draft`. The first line is `D<n>: <title>`.
   The lines after it are the draft itself. The form:

   ````
   ```draft
   D3: README, the Install section
   ## Install

   Run the two commands below. The first one adds the marketplace, the second one installs the plugin.
   ```
   ````

2. Number drafts in one sequence for the conversation. Start after the highest `D<n>` already in
   the transcript. Never reuse a number.
3. Write a revision as a new block with a new number. Its first line is
   `D<m> (revises D<n>): <title>`. Never rewrite an earlier block in place: a later comment names
   "D3", and that must keep one meaning.
4. When the draft itself contains a three-backtick fence, open and close the `draft` block with
   four backticks.
5. Write what the draft is for, and any doubt about it, in plain text before the block. Write
   nothing that belongs to the draft outside the block: the pane shows only the block.
6. A prompt that starts with `Feedback (draft-pane) on D<n>:` is the person's feedback on that
   draft, sent from the pane in one batch. A line that starts with `> ` quotes a span of the
   draft; the line after it is the comment on that span. A line `(whole draft) <comment>` is a
   comment on the whole draft. `(approved)` means the person uses the draft as it is, so do the
   next step with that text. For any other feedback, write the revision as in step 3, in the same
   turn.
