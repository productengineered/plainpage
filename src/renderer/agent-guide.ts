/* Instructions for AI agents — docs/agents.md, the one guide, turned into a
 * prompt the reviewer pastes into an agent (Help ▸ Copy Instructions for
 * Agents, the palette, Settings). The guide is split on its `## ` sections;
 * a prompt is a short preamble plus the sections asked for, with the
 * guide's example initials (BD) swapped for the reviewer's own when set. */

export type GuideTopic = 'all' | 'response-rows' | 'copy-sections' | 'task-lists'

export const GUIDE_TOPICS: readonly { id: GuideTopic; label: string }[] = [
  { id: 'all', label: 'All Features' },
  { id: 'response-rows', label: 'Response Rows' },
  { id: 'copy-sections', label: 'Copy Sections' },
  { id: 'task-lists', label: 'Task Lists' }
]

/* Rides along with any single topic: how to treat the reviewer's edits. */
const ALWAYS = 'reading-the-reviewers-edits'
const EXAMPLE_INITIALS = 'BD'

export interface GuideSection {
  id: string
  /* The section's markdown, its `## ` heading included. */
  markdown: string
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/* The guide's `## ` sections, in order. Headings inside fenced code are
 * not sections: the guide's own examples could contain one. */
export function guideSections(md: string): GuideSection[] {
  const sections: GuideSection[] = []
  let current: { id: string; lines: string[] } | null = null
  let fenced = false
  for (const line of md.split('\n')) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^## (.+)$/.exec(line)
    if (heading?.[1]) {
      if (current) sections.push({ id: current.id, markdown: current.lines.join('\n').trim() })
      current = { id: slug(heading[1]), lines: [line] }
    } else {
      current?.lines.push(line)
    }
  }
  if (current) sections.push({ id: current.id, markdown: current.lines.join('\n').trim() })
  return sections
}

/* A typed value as response-row initials: letters and digits only, upper
 * case, at most four. Empty means none set. */
export function normalizeInitials(raw: string): string | null {
  const initials = raw
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase()
    .slice(0, 4)
  return initials === '' ? null : initials
}

export function agentPrompt(md: string, topic: GuideTopic, initials: string | null): string {
  const sections = guideSections(md)
  const picked = topic === 'all' ? sections : sections.filter((s) => s.id === topic || s.id === ALWAYS)
  const responses = picked.some((s) => s.id === 'response-rows')
  const label = `${initials ?? EXAMPLE_INITIALS} RESPONSE:`
  const preamble = [
    'I read the markdown documents you write for me in Plainpage, a markdown editor that works directly on plain .md files. Follow these conventions when you write them.',
    responses
      ? initials
        ? `My initials are ${initials}, so label response rows \`${label}\`.`
        : `Label response rows with my initials, for example \`${label}\`.`
      : ''
  ]
    .filter(Boolean)
    .join(' ')
  const body = picked.map((s) => s.markdown).join('\n\n')
  const personal = initials ? body.replace(new RegExp(`\\b${EXAMPLE_INITIALS}\\b`, 'g'), initials) : body
  return `# Writing documents for me in Plainpage\n\n${preamble}\n\n${personal}\n`
}
