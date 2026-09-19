# draft-pane

[![test](https://github.com/meganemura/draft-pane/actions/workflows/test.yml/badge.svg)](https://github.com/meganemura/draft-pane/actions/workflows/test.yml)

A Claude Code plugin (a Claude Mod). Its skill, `draft-pane:draft`, makes Claude write a
requested draft inside a block. The pane shows the newest open draft. The person drags over a
span and types a comment, types one comment on the whole draft, or approves it. One Submit sends
every comment as one prompt that quotes each span. The aim is feedback in place, with fewer
turns.

## What it looks like

```
D3 README, the Install section
## Install
Run the two commands below.
[ x ] > Run the two commands below.  1 sentence is enough
The first one adds the marketplace, the second one installs the plugin.
> the second one installs the plugin
comment: [        ]
whole draft: [        ]
[ Approve ] [ Submit ]  1 comment
```

## Requirements

- Claude Code 2.1.273 or later, with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`

## Install

```sh
claude plugin marketplace add meganemura/draft-pane
claude plugin install draft-pane@draft-pane
```

To develop against a checkout, run the plugin from its working tree:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir /path/to/draft-pane/plugin
```

To set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` for each session, add it to the `env` of
`settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

## Use

Start with `/draft-pane:draft <what to draft>`. `/draft-pane` shows or hides the pane and gives
it keyboard focus. Drag the mouse over a span of the draft; a line with the quoted span appears
right under the line it ends on, and under that an input labeled `comment`. Type a comment and
press Enter to add it; press Enter with an empty input to drop the span. Each added comment stays
right under the line of the words it quotes, in the order those lines appear in the draft. A
selection cannot cross a line that already carries a comment — drag within the lines between two
comments instead. Type in the `whole draft` input and press Enter to add one comment on the whole
draft; a second Enter replaces it. Press `x` beside a comment to remove it. Press `Submit` to send
every comment, or `Approve` to send approval; both refuse while an input still holds text that
Enter has not added. The arrow keys move between controls, Enter presses, Esc returns focus to
the prompt box. After you show the pane once, it opens on its own when a draft arrives, without
taking the keyboard; hide it with `/draft-pane` to stop that.

## The draft block

The plugin's skill writes each draft inside a fenced block labeled `draft`:

```draft
D3: README, the Install section
## Install

Run the two commands below. The first one adds the marketplace, the second one installs the plugin.
```

The first line is `D<n>: <title>`. The lines after it are the draft itself. Numbers run in one
sequence for the whole conversation and are never reused. A revision is a new block with a new
number; its first line is `D<m> (revises D<n>): <title>`. The pane shows only the drafts in the
newest assistant message that has a `draft` block; an older draft leaves the pane once a later
message posts one, answered or not.

When the draft already exists as a file, the block names it instead of carrying its text:

```draft
D5: The article on pane plugins
file: /work/notes/article.md
```

The line right after the header, `file: <path>`, makes the draft a file draft; any further lines
in the block are ignored. The path is absolute, or relative to the working directory the session
runs in. There is no `~` expansion: write the path out in full. On macOS, a file under a folder
the system protects (Documents, Desktop, Downloads) can raise a permission dialog for the terminal
application on the first read.

## The feedback prompt

Pressing `Submit` sends one prompt:

```
Feedback (draft-pane) on D3:
> Run the two commands below.
1 sentence is enough. "below" is not needed.
> the second one installs the plugin
Name the plugin, not "the plugin".
(whole draft) Make the whole section shorter.
```

A `> ` line quotes the span; the next line is the comment. Spans come in the order they appear in
the draft. A comment on the whole draft comes last.

For a file draft, the second line names the file the quotes came from:

```
Feedback (draft-pane) on D5:
file: /work/notes/article.md
> a quoted span from the file
Shorten this sentence.
```

## What Approve means

Approve sends `Feedback (draft-pane) on D3:` then `(approved)`: use the draft as it is. Approve
refuses while comments are pending. Submit refuses with zero comments. Both refuse while an
input still holds text that Enter has not added. The status line says which.

## The transcript is the source of truth

Every draft the pane shows is text inside an assistant message. Every piece of feedback the pane
sends is a prompt that quotes the draft. A person with the plugin uninstalled can still read every
draft and every piece of feedback in the transcript alone.

## Development

Three gates run before a commit and in CI: `claude plugin validate plugin`,
`npx -p typescript tsc -p plugin/hooks`, and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin
test plugin`.

## License

MIT. See [LICENSE](LICENSE).
