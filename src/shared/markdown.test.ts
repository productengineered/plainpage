import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { referenceDefinitions, renderMarkdown } from './markdown'

describe('renderMarkdown — THE pipeline', () => {
  it('renders headings, gfm strikethrough, and tables', async () => {
    const html = await renderMarkdown('# H\n\n~~x~~\n\n| a |\n| - |\n| b |')
    expect(html).toContain('<h1 id="h">H</h1>')
    expect(html).toContain('<del>x</del>')
    expect(html).toContain('<table>')
  })

  it('renders footnotes (deferred from the editor, promised to exports)', async () => {
    const html = await renderMarkdown('ref[^1]\n\n[^1]: def')
    expect(html).toContain('data-footnotes')
    expect(html).toContain('def')
  })

  it('headings carry github-style anchor ids', async () => {
    const html = await renderMarkdown('# Getting Started!\n\n## Café "quoted"')
    expect(html).toContain('<h1 id="getting-started">')
    expect(html).toContain('<h2 id="café-quoted">')
  })

  it('duplicate heading text gets suffixed ids', async () => {
    const html = await renderMarkdown('## Install\n\n## Install\n\n## Install')
    expect(html).toContain('<h2 id="install">')
    expect(html).toContain('<h2 id="install-1">')
    expect(html).toContain('<h2 id="install-2">')
  })

  it('a hand-written toc link resolves to its heading', async () => {
    const html = await renderMarkdown('- [Install](#install)\n\n## Install')
    const href = /<a href="#([^"]+)">/.exec(html)?.[1]
    expect(href).toBe('install')
    expect(html).toContain(`<h2 id="${href}">`)
  })

  it('highlights fences through the same css-variables Shiki theme', async () => {
    const html = await renderMarkdown('```js\nconst x = 1\n```')
    expect(html).toContain('var(--shiki-')
    expect(html).toContain('shiki')
  })

  it('does not pass raw html through (dangerous html stays escaped)', async () => {
    const html = await renderMarkdown('hello <script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('a literal <br> is a line break — the one a table cell can hold — in any spelling', async () => {
    const html = await renderMarkdown('| a |\n| - |\n| x<br>y <br/> z<BR />w |')
    expect(html).toContain('<td>x<br>\ny <br>\nz<br>\nw</td>')
  })

  it('<br> breaks a paragraph line too, while other raw tags still stay out', async () => {
    const html = await renderMarkdown('para<br>two <span>s</span>')
    expect(html).toContain('<p>para<br>\ntwo s</p>')
    expect(html).not.toContain('<span>')
  })

  it('unknown fence languages fall back to plain text', async () => {
    const html = await renderMarkdown('```nosuchlang\nplain\n```')
    expect(html).toContain('plain')
  })

  it('sourcePositions stamps block elements with source offsets', async () => {
    const html = await renderMarkdown('# One\n\ntext here', { sourcePositions: true })
    expect(html).toContain('<h1 id="one" data-pos="0">')
    expect(html).toContain('data-pos="7"')
  })

  it('sourcePositions stamps code blocks too, though Shiki rebuilds them', async () => {
    // Plain, preloaded-on-demand, unknown, and nested-in-a-list fences: each
    // highlighted <pre> keeps its own fence's offset, in document order.
    const md = [
      'intro', '', '```', 'plain fence', '```', '',
      '```js', 'const a = 1', '```', '',
      '```nosuchlang', 'x', '```', '',
      '- item', '', '  ```py', '  y = 2', '  ```', ''
    ].join('\n')
    const html = await renderMarkdown(md, { sourcePositions: true })
    const stamps = [...html.matchAll(/<pre\b[^>]*\bdata-pos="(\d+)"/g)].map((m) => Number(m[1]))
    const fences = [md.indexOf('```\n'), md.indexOf('```js'), md.indexOf('```nosuchlang'), md.indexOf('```py')]
    expect(stamps).toEqual(fences)
  })

  it('default rendering carries no position stamps (exports stay clean)', async () => {
    const html = await renderMarkdown('# One\n\ntext here')
    expect(html).not.toContain('data-pos')
  })
})

describe('referenceDefinitions', () => {
  it('collects link and footnote definitions as written, nowhere else', () => {
    const md = 'See [guide][ref] and a note[^n].\n\n[ref]: https://example.com "Guide"\n\n> [q]: https://q.example\n\n[^n]: The note.\n\nPlain text.'
    expect(referenceDefinitions(md)).toEqual({
      links: '[ref]: https://example.com "Guide"\n\n[q]: https://q.example',
      footnotes: '[^n]: The note.'
    })
  })

  it('is empty without definitions', () => {
    expect(referenceDefinitions('# Just text\n\n- a list')).toEqual({ links: '', footnotes: '' })
  })
})

describe('copy sections', () => {
  const sections = (html: string, md: string): string[] =>
    [...html.matchAll(/data-copy-from="(\d+)" data-copy-to="(\d+)"/g)].map((m) =>
      md.slice(Number(m[1]), Number(m[2])).trim()
    )

  it('wraps the blocks between the markers and records their source', async () => {
    const md = 'Before\n\n<!-- copy -->\nOne **bold**.\n\n- a\n  - b\n<!-- /copy -->\n\nAfter'
    const html = await renderMarkdown(md, { sourcePositions: true })
    expect(sections(html, md)).toEqual(['One **bold**.\n\n- a\n  - b'])
    expect(html).toMatch(/<p data-pos="\d+">Before<\/p>\n<div class="copy-section"/)
    expect(html).toMatch(/<\/ul><\/div>\n<p data-pos="\d+">After<\/p>/)
    expect(html).not.toContain('copy --')
  })

  it('an unclosed section runs to the end of its container', async () => {
    const md = '<!-- copy -->\nfirst\n\nsecond'
    const html = await renderMarkdown(md, { sourcePositions: true })
    expect(sections(html, md)).toEqual(['first\n\nsecond'])
  })

  it('markers do not nest: an inner opening marker is dropped', async () => {
    const md = '<!-- copy -->\na\n<!-- copy -->\nb\n<!-- /copy -->\n\nc'
    const html = await renderMarkdown(md, { sourcePositions: true })
    expect(html.match(/copy-section/g)?.length).toBe(1)
    expect(sections(html, md)).toEqual(['a\n<!-- copy -->\nb'])
  })

  it('a stray closing marker, or one inline in a paragraph, changes nothing', async () => {
    const html = await renderMarkdown('<!-- /copy -->\n\ntext <!-- copy --> more')
    expect(html).toBe('<p>text  more</p>')
  })

  it('a section inside a list item records the item indent', async () => {
    const md = '- item\n  - nested\n\n    <!-- copy -->\n    Inside **the** item.\n    <!-- /copy -->'
    const html = await renderMarkdown(md, { sourcePositions: true })
    expect(html).toContain('data-copy-indent="4"')
    expect(sections(html, md)).toEqual(['Inside **the** item.'])
  })

  it('exports get the wrapper without source offsets', async () => {
    const html = await renderMarkdown('<!-- copy -->\nx\n<!-- /copy -->')
    expect(html).toBe('<div class="copy-section"><p>x</p></div>')
  })
})

/* Golden files (ULTRAPLAN §8): fixtures/*.md must render byte-identically
 * to their committed .golden.html. Regenerate deliberately with
 * UPDATE_GOLDENS=1 pnpm test — a diff here means export output changed and
 * the change must be intentional. */
describe('golden files', () => {
  const dir = join(process.cwd(), 'fixtures')

  it('every fixture matches its golden output', async () => {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md'))
    expect(files.length).toBeGreaterThan(0)
    await mkdir(join(dir, 'golden'), { recursive: true })
    for (const file of files) {
      const markdown = await readFile(join(dir, file), 'utf8')
      const html = await renderMarkdown(markdown)
      const goldenPath = join(dir, 'golden', file.replace(/\.md$/, '.golden.html'))
      if (process.env['UPDATE_GOLDENS']) {
        await writeFile(goldenPath, html, 'utf8')
      } else {
        const golden = await readFile(goldenPath, 'utf8')
        expect(html, `${file} diverged from its golden output`).toBe(golden)
      }
    }
  })
})
