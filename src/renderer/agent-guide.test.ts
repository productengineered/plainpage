import { describe, expect, it } from 'vitest'
import guide from '../../docs/agents.md?raw'
import { renderMarkdown } from '../shared/markdown'
import { agentPrompt, GUIDE_TOPICS, guideSections, normalizeInitials } from './agent-guide'
import { commitCell, isResponseTable, parseTable } from './editor/table-model'

/* The guide's fenced markdown examples, per section. */
function examples(sectionId: string): string[] {
  const section = guideSections(guide).find((s) => s.id === sectionId)
  if (!section) throw new Error(`no section ${sectionId}`)
  return [...section.markdown.matchAll(/```markdown\n([\s\S]*?)```/g)].map((m) => (m[1] ?? '').trimEnd())
}

describe('docs/agents.md', () => {
  it('has a section for every topic the menu offers', () => {
    const ids = guideSections(guide).map((s) => s.id)
    for (const topic of GUIDE_TOPICS) {
      if (topic.id !== 'all') expect(ids).toContain(topic.id)
    }
    expect(ids).toContain('reading-the-reviewers-edits')
  })

  /* The guide is checked against the app, so a change to either that
   * breaks what the guide promises fails here. */
  describe('says only what the app does', () => {
    it('response rows: the blank example is one, and answering it gives the answered example', () => {
      const [blank, answered] = examples('response-rows')
      if (blank === undefined || answered === undefined) throw new Error('two response-row examples expected')
      const model = parseTable(blank)
      expect(isResponseTable(model)).toBe(true)
      expect(model.header[1]?.trim()).toBe('')
      const typed = commitCell(blank, 0, 1, 'Agreed, but cut the second example.')
      expect(typed).toBe(answered)
      expect(isResponseTable(parseTable(answered))).toBe(true)
    })

    it('response rows: a typed line break is saved as <br>, a typed pipe as \\|', () => {
      const [blank = ''] = examples('response-rows')
      expect(commitCell(blank, 0, 1, 'one\ntwo')).toContain('| one<br>two |')
      expect(commitCell(blank, 0, 1, 'a | b')).toContain('| a \\| b |')
    })

    it('copy sections: the example renders as one, formatting kept, markers hidden', async () => {
      const [example = ''] = examples('copy-sections')
      const html = await renderMarkdown(example)
      expect(html).toContain('class="copy-section"')
      expect(html).toContain('<strong>Strength:</strong>')
      expect(html).not.toContain('copy --')
    })

    it('task lists: the example renders a box per item, the x one ticked', async () => {
      const [example = ''] = examples('task-lists')
      const html = await renderMarkdown(example)
      expect(html.match(/type="checkbox"/g)).toHaveLength(2)
      expect(html.match(/checked/g)).toHaveLength(1)
    })

    it('plain markdown: raw HTML is dropped, <br> in a cell is kept', async () => {
      expect(await renderMarkdown('<div class="x">hi</div>\n')).not.toContain('<div class="x">')
      expect(await renderMarkdown('| a |\n| - |\n| one<br>two |\n')).toMatch(/one<br>\s*two/)
    })
  })
})

describe('normalizeInitials', () => {
  it('keeps letters and digits, upper case, four at most', () => {
    expect(normalizeInitials('bd')).toBe('BD')
    expect(normalizeInitials(' j.s. ')).toBe('JS')
    expect(normalizeInitials('abcdef')).toBe('ABCD')
    expect(normalizeInitials('  ')).toBeNull()
  })
})

describe('agentPrompt', () => {
  it('everything, with the example initials when none are set', () => {
    const prompt = agentPrompt(guide, 'all', null)
    expect(prompt).toContain('for example `BD RESPONSE:`')
    for (const s of guideSections(guide)) expect(prompt).toContain(s.markdown)
    expect(prompt).not.toContain('# Plainpage: a guide for AI agents')
  })

  it("puts the reviewer's initials everywhere the example ones were", () => {
    const prompt = agentPrompt(guide, 'all', 'JS')
    expect(prompt).toContain('My initials are JS, so label response rows `JS RESPONSE:`.')
    expect(prompt).toContain('| JS RESPONSE: | |')
    expect(prompt).not.toMatch(/\bBD\b/)
  })

  it('one topic: that section and how to read edits back, nothing else', () => {
    const prompt = agentPrompt(guide, 'copy-sections', 'JS')
    expect(prompt).toContain('## Copy sections')
    expect(prompt).toContain("## Reading the reviewer's edits")
    expect(prompt).not.toContain('## Response rows')
    expect(prompt).not.toContain('RESPONSE:')
  })

  it('a ## inside a code fence is not a section', () => {
    const md = '# T\n\n## One\n\n```markdown\n## not a section\n```\n\n## Two\n\nx\n'
    expect(guideSections(md).map((s) => s.id)).toEqual(['one', 'two'])
  })
})
