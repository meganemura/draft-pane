# 0005. CI runs the same three gates, pinned

- Status: accepted
- Date: 2026-09-18

## Context

The three quality gates — `claude plugin validate plugin`, `tsc -p plugin/hooks`, the plugin
tests — ran locally only, before a commit. Running them on every push and pull request checks
every change the same way, automatically. None of the three gates calls the model, so the
workflow needs no API credential.

## Decision

`.github/workflows/test.yml` runs on every push to `main` and every pull request:

- `actions/checkout` v7.0.1, then `actions/setup-node` v7.0.0 (Node `22.23.2`), both pinned by
  commit
- `npm install -g @anthropic-ai/claude-code@2.1.273`
- `/plugin-types`, under `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (the flag the plugin itself
  needs). This step writes `.claude/types/claude-code.d.ts`, which `tsc` reads
- the three gates: `claude plugin validate plugin`,
  `npx --yes --package typescript@7.0.2 tsc -p plugin/hooks`, and `claude plugin test plugin`

## Consequences

- `@anthropic-ai/claude-code@2.1.273` was published on 2026-09-15. It is a stated exception to
  the rule that a pinned version is 7 or more days old: `claude plugin test` first shipped in
  that version, so no older version can run the third gate. Revisit the pin on or after
  2026-09-22.
- 2.1.273 is the same version grilling-pane and pull-request-pane pinned for the same three
  gates.
- The local gates ran on `2.1.276`. The generated `.claude/types/claude-code.d.ts` for the pinned
  version was checked to carry `Input`, `Client`, `ui.message`, `ui.focus`, `session.messages`,
  and `prompt.submit` — everything this plugin's module and its tests call — and not the test
  kit's own `mount`, which is a separate module from the plugin's own hooks types.
- Bumping any pinned version is a deliberate edit to this file, never an implicit `latest` on the
  next run.
