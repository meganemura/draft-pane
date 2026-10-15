// Pure SVG markup for the desktop pane's `Svg` elements: the comment map under a draft's header
// and the revision trail beside it. No `$`, no element constructors: desktop.ts passes each
// string to `Svg({ source })`. Must not know about the pane's state, a drag, or the feedback
// prompt; only offsets, numbers and the text that a tooltip shows.
//
// The desktop draws an `Svg` as an image or in a script-less frame, never in its own page, so the
// markup carries its own colors. One `<style>` block gives a light and a dark set through
// `prefers-color-scheme`, which both an image and a frame follow.

export type MapMark = { start: number; end: number; tip: string }

const STYLE = [
  '<style>',
  '.track{fill:#e8e6dc}.mark{fill:#d97757}.pending{fill:none;stroke:#3b82f6;stroke-width:2}',
  '.dot{fill:#faf9f5;stroke:#87867f;stroke-width:2}.now{fill:#d97757;stroke:#d97757}',
  '.line{stroke:#b0aea5;stroke-width:2}.label{font:600 11px ui-sans-serif,system-ui,sans-serif;fill:#3d3d3a}',
  '.mark:hover,.dot:hover{opacity:.7}',
  '@media (prefers-color-scheme:dark){.track{fill:#3d3d3a}.dot{fill:#262624;stroke:#9a988f}',
  '.line{stroke:#5e5d59}.label{fill:#e8e6dc}}',
  '</style>',
].join('')

// The five characters XML gives a meaning to, written as entities, so a quote or a title from a
// draft can never close an element or open a new one.
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c)
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}

// A bar as long as the draft's body. Each committed span is a filled mark at its place, the
// pending selection an outlined one, so the person sees at a glance where the comments fall in a
// long draft. Each mark carries a `<title>`, which the desktop shows as a tooltip when the `Svg`
// is drawn with `isInteractive`. A span too short to see is drawn 3 units wide.
export function commentMapSvgOf(bodyLength: number, marks: readonly MapMark[], pending: MapMark | null, width = 600): string {
  const height = 14
  const scale = bodyLength > 0 ? width / bodyLength : 0
  const rectOf = (mark: MapMark, cls: string): string => {
    const x = Math.min(mark.start * scale, width - 3)
    const w = Math.max((mark.end - mark.start) * scale, 3)
    return `<rect class="${cls}" x="${round(x)}" y="2" width="${round(w)}" height="${height - 4}" rx="2"><title>${escapeXml(mark.tip)}</title></rect>`
  }
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    STYLE,
    `<rect class="track" x="0" y="5" width="${width}" height="4" rx="2"/>`,
    ...marks.map((mark) => rectOf(mark, 'mark')),
    ...(pending === null ? [] : [rectOf(pending, 'pending')]),
    '</svg>',
  ]
  return parts.join('')
}

// The drafts from the first one to the current one, as dots on a line, left to right, labeled
// `D<n>`. The current draft is the filled dot. Each dot's `<title>` is that draft's title.
export function revisionTrailSvgOf(trail: readonly { number: number; title: string }[]): string {
  const step = 56
  const radius = 6
  const width = Math.max(step * trail.length, step)
  const height = 34
  const cx = (index: number): number => step / 2 + index * step
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`, STYLE]
  if (trail.length > 1) parts.push(`<line class="line" x1="${cx(0)}" y1="${radius + 2}" x2="${cx(trail.length - 1)}" y2="${radius + 2}"/>`)
  trail.forEach((draft, index) => {
    const cls = index === trail.length - 1 ? 'dot now' : 'dot'
    const tip = escapeXml(`D${draft.number}: ${draft.title}`)
    parts.push(`<g><circle class="${cls}" cx="${cx(index)}" cy="${radius + 2}" r="${radius}"><title>${tip}</title></circle>`)
    parts.push(`<text class="label" x="${cx(index)}" y="${height - 4}" text-anchor="middle">D${draft.number}</text></g>`)
  })
  parts.push('</svg>')
  return parts.join('')
}

// The picture the empty pane shows: a sheet of paper with a pen line, in the trail's colors.
export function emptySheetSvgOf(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
    STYLE,
    '<rect class="dot" x="14" y="8" width="36" height="48" rx="4"/>',
    '<line class="line" x1="22" y1="22" x2="42" y2="22"/>',
    '<line class="line" x1="22" y1="30" x2="42" y2="30"/>',
    '<line class="line" x1="22" y1="38" x2="34" y2="38"/>',
    '<circle class="dot now" cx="44" cy="46" r="5"/>',
    '</svg>',
  ].join('')
}
