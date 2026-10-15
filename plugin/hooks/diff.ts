// Pure line diff for the desktop pane's `Changes` view: the text of an earlier draft against the
// text of the draft that revises it, written as unified-diff hunks, the shape the desktop's
// `Code` element draws under `format: 'diff'`. No `$`, no drawing: mod.ts and desktop.ts are the
// only callers. Must not know what a draft is, or where the two texts came from.

type Op = { kind: ' ' | '-' | '+'; text: string; oldLine: number; newLine: number }

// Past this many cells, the longest-common-subsequence table costs too much for a draft pane.
// The diff then falls back to one hunk that removes every old line and adds every new one: still
// a correct diff, only a less precise one.
const MAX_TABLE_CELLS = 4_000_000

// The edit script from `before` to `after`, one entry per line, in order. Each entry keeps its
// 1-based line number in both texts (the number of the next line, for the side it is absent on),
// which is what a hunk header needs.
function opsOf(before: readonly string[], after: readonly string[]): Op[] {
  const n = before.length
  const m = after.length
  if (n * m > MAX_TABLE_CELLS) {
    return [
      ...before.map((text, i) => ({ kind: '-' as const, text, oldLine: i + 1, newLine: 1 })),
      ...after.map((text, j) => ({ kind: '+' as const, text, oldLine: n + 1, newLine: j + 1 })),
    ]
  }

  // lcs[i][j]: the length of the longest common subsequence of before[i..] and after[j..].
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = lcs[i] as Uint32Array
    const below = lcs[i + 1] as Uint32Array
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      ops.push({ kind: ' ', text: before[i] ?? '', oldLine: i + 1, newLine: j + 1 })
      i += 1
      j += 1
    } else if (i < n && (j === m || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      // A removal goes before the addition that replaces it, as `diff -u` writes them.
      ops.push({ kind: '-', text: before[i] ?? '', oldLine: i + 1, newLine: j + 1 })
      i += 1
    } else {
      ops.push({ kind: '+', text: after[j] ?? '', oldLine: i + 1, newLine: j + 1 })
      j += 1
    }
  }
  return ops
}

// The start and length of one side of a hunk header. A side with no lines names the line before
// the hunk, as `diff -u` does (`-0,0` for an insertion at the very top).
function rangeOf(start: number, length: number): string {
  return `${length === 0 ? start - 1 : start},${length}`
}

// `before` against `after` as unified-diff hunks with `context` unchanged lines around each
// change, or the empty string when the two texts are the same. Hunks closer than twice the
// context merge into one, as `diff -u` merges them.
export function unifiedDiffOf(before: string, after: string, context = 3): string {
  const ops = opsOf(before.split('\n'), after.split('\n'))
  const changed = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0)
  if (changed.length === 0) return ''

  const groups: { from: number; to: number }[] = []
  for (const index of changed) {
    const from = Math.max(0, index - context)
    const to = Math.min(ops.length - 1, index + context)
    const last = groups.at(-1)
    if (last !== undefined && from <= last.to + 1) {
      last.to = Math.max(last.to, to)
    } else {
      groups.push({ from, to })
    }
  }

  const out: string[] = []
  for (const { from, to } of groups) {
    const slice = ops.slice(from, to + 1)
    const first = slice[0] as Op
    const oldLength = slice.filter((op) => op.kind !== '+').length
    const newLength = slice.filter((op) => op.kind !== '-').length
    out.push(`@@ -${rangeOf(first.oldLine, oldLength)} +${rangeOf(first.newLine, newLength)} @@`)
    for (const op of slice) out.push(`${op.kind}${op.text}`)
  }
  return out.join('\n')
}

// How many lines the diff adds and removes, for the tab label and the header line.
export function diffStatOf(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) continue
    if (line.startsWith('+')) added += 1
    else if (line.startsWith('-')) removed += 1
  }
  return { added, removed }
}
