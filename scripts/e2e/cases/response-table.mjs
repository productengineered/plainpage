/* A response table — two columns, first header ending in "response:" —
 * renders as a form row in both modes: the label column hugs its text on
 * one line, the answer column takes the rest of the width, and typing an
 * answer doesn't move the split. An ordinary two-column table keeps its
 * content-proportioned columns. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'response tables: label column hugs its text, answer column fills the width'

const doc = [
  '# Feedback',
  '',
  '| BD RESPONSE: | |',
  '| ------------ | --- |',
  '',
  '| Name | Notes |',
  '| ---- | ----- |',
  ''
].join('\n')

/* Each table in `root`: label/answer cell widths as fractions of the table,
 * and whether the label sits on one line. */
const measure = (root) => `[...${root}.querySelectorAll('table')].map(table => {
  const [label, answer] = table.querySelector('tr').children
  const t = table.getBoundingClientRect().width
  const range = document.createRange()
  range.selectNodeContents(label)
  return { response: table.classList.contains('fs-response-table'),
    label: label.getBoundingClientRect().width / t, answer: answer.getBoundingClientRect().width / t,
    labelLines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size }
})`

export async function run() {
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)
    const preview = await app.evaluate(measure(`document.querySelector('.preview')`))
    expect(preview.length, 'preview: both tables').toBe(2)
    expect(preview[0].response, 'preview: the response table is recognised').toBe(true)
    expect(preview[0].labelLines, 'preview: the label stays on one line').toBe(1)
    expect(preview[0].label < 0.3, `preview: the label column hugs its text (${preview[0].label})`).toBe(true)
    expect(preview[0].answer > 0.7, `preview: the answer column fills the rest (${preview[0].answer})`).toBe(true)
    expect(preview[1].response, 'preview: an ordinary table is not a response table').toBe(false)

    await app.cmd('e')
    await app.until(`!!document.querySelector('.cm-content .fs-table-grid table')`, { label: 'grid shown' })
    const grid = await app.evaluate(measure(`document.querySelector('.cm-content')`))
    expect(grid.length, 'editor: both tables render as grids').toBe(2)
    expect(grid[0].response, 'editor: the response table is recognised').toBe(true)
    expect(grid[0].labelLines, 'editor: the label stays on one line').toBe(1)
    expect(grid[0].label < 0.3, `editor: the label column hugs its text (${grid[0].label})`).toBe(true)
    expect(grid[0].answer > 0.7, `editor: the answer column fills the rest (${grid[0].answer})`).toBe(true)
    expect(grid[1].response, 'editor: an ordinary table is not a response table').toBe(false)

    // Type an answer — one long unbroken token — into the empty cell; the
    // split stays where it was while typing and after the commit.
    const LONG = 'https://example.com/' + 'x'.repeat(60)
    const at = await app.evaluate(`(() => { const r = document.querySelector('.cm-content .fs-response-table th:last-child').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await app.click(at.x, at.y)
    await app.until(`!!document.querySelector('.fs-editing-cell')`, { label: 'cell editing' })
    await app.type(LONG)
    const typing = await app.evaluate(measure(`document.querySelector('.cm-content')`))
    expect(typing[0].label, 'the label column holds while typing').toBeCloseTo(grid[0].label, 0.01)
    const heading = await app.evaluate(`(() => { const r = document.querySelector('.cm-content .cm-line').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 } })()`)
    await app.click(heading.x, heading.y)
    await app.until(`!document.querySelector('.fs-editing-cell') && $.view.state.doc.toString().includes(${JSON.stringify(LONG)})`, { label: 'answer committed' })
    const after = await app.evaluate(measure(`document.querySelector('.cm-content')`))
    expect(after[0].response, 'still a response table after answering').toBe(true)
    expect(after[0].label, 'the label column did not move').toBeCloseTo(grid[0].label, 0.01)
  } finally {
    await app.close()
  }
}
