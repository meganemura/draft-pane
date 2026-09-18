# AGENTS.md

Context for agents that work in this repository.

## What this is

draft-pane, a Claude Code plugin with two parts. A skill tells the model to
write any requested draft (a README section, a commit message, a document
paragraph, a reply) in a block the pane can read. A hooks module (a "Claude
Mod") reads the newest open draft from the transcript, draws it in a pane
beside the transcript, and lets the person give feedback on it: drag over a
span and type a comment, type one comment on the whole draft, or approve
it. One Submit sends all feedback as one prompt that quotes each span.

The purpose is feedback in place, with fewer turns. The person points at the
words, not at a line number, and sends every comment at once.

The plugin lives in `plugin/`. There is no build step and no runtime package
dependency.

## Visibility

The layer is public-possible: commit messages, comments, README and docs
are in English. Follow ASD-STE100 Simplified Technical English. Test
fixtures use invented drafts, never a real project's text.

## Rules

- Function hooks are early access. The module loads only where
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set. The API can change between
  releases. The types come from `/plugin-types`, which writes
  `.claude/types/claude-code.d.ts` at the repository root; that directory is
  gitignored, so run `/plugin-types` once in a new checkout.
- The validator reads the module statically. Hand `$` only to function
  declarations at the top of the module, and spell every call
  `$.noun.event(...)`. Build one `host` bundle of closures over `$` at
  `session.start`; the rest of the module holds the host, never `$`.
- Never read the transcript from the render hook. Parse on `turn.complete`
  and on `session.start`, keep the result in state, and draw from state.
- The transcript is the source of truth. Every draft the pane shows is in
  an assistant message, and every piece of feedback the pane submits is a
  prompt that quotes the span. Nothing lives only in the pane.
- Every `Pane` element prop must be one the surface declares. One unknown
  prop drops the whole tree without a message. Type the element constructors
  with `Elements['terminal']` so the compiler catches it.
- Tests are `plugin/tests/*.test.ts`, run with
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test plugin`. They stub
  `session.messages`, `prompt.submit`, `ui.status` and `store`. The block
  parser, the feedback formatter and the span mapping are plain functions
  with their own tests. The kit cannot type into an `Input`, drive a
  `Client`'s pointer, or raise `ui.message`; each `Input` closure is one line
  that calls a pure function, and the `Client` module is tested with a
  hand-rolled surface double.
- Quality gates: `claude plugin validate plugin`, `npx -p typescript tsc -p
  plugin/hooks`, and the plugin tests. Run all three before a commit.
- A real-terminal round (in tmux is fine) is a gate for any change to the
  drawing or the drag. `-p` has no pane surface. Hook failures are fail-open
  and appear only in `~/.claude/debug/<session>.txt`.
- Design decisions go to `docs/decisions/` as short numbered notes
  (Context / Decision / Consequences).
- Commits are semantic units. Comments say why, not what. Each module starts
  with its responsibility and what it must not know about.
- Adding a dependency: exact pin, released 7 or more days ago with no
  security fix after it, and ask the owner first with the reason.
