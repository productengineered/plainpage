/* A copy section (`<!-- copy -->` … `<!-- /copy -->`) renders in preview as
 * a framed block with a copy button in its corner. The markers never show,
 * the text never runs under the button, and a click hands the markdown
 * between the markers — bullets and bold intact — to the rich-text copy
 * (stubbed here: an e2e run must not clobber the developer's clipboard).
 * A double-click on the button stays in preview. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'copy sections carry a button that copies their markdown with its formatting'

const FIRST = 'I enjoyed reading this, and **this part** matters. It runs long enough to wrap across the line so the button column is tested.\n\n- A bullet with *emphasis*.\n  - A nested bullet.'
const SECOND = 'Points note - Full credit.'

const doc = ['# Review', '', 'Before.', '', '<!-- copy -->', FIRST, '<!-- /copy -->', '', 'Between.', '', '<!-- copy -->', SECOND, '<!-- /copy -->', '', 'After.', ''].join('\n')

export async function run() {
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)
    const layout = await app.evaluate(`[...document.querySelectorAll('.preview .copy-section')].map(section => {
      const button = section.querySelector(':scope > button.code-copy')
      const b = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(section.querySelector('p'))
      const textRight = Math.max(...[...range.getClientRects()].map(r => r.right))
      return { visible: b.width > 0 && getComputedStyle(button).visibility !== 'hidden', textRight, buttonLeft: b.left,
        label: button.getAttribute('aria-label'), bullets: section.querySelectorAll('li').length }
    })`)
    expect(layout.length, 'one framed block per section').toBe(2)
    for (const [i, s] of layout.entries()) {
      expect(s.visible, `section ${i}: button shown without hovering`).toBe(true)
      expect(s.textRight <= s.buttonLeft, `section ${i}: text (right edge ${s.textRight}) stays left of the button (${s.buttonLeft})`).toBe(true)
      expect(s.label, `section ${i}: labelled`).toBe('Copy section')
    }
    expect(layout[0].bullets, 'the bullets render inside the section').toBe(2)
    expect(await app.evaluate(`document.querySelector('.preview').textContent.includes('copy --')`), 'markers never show').toBe(false)

    await app.evaluate(`(window.__copied = [], $.preview.copyRich = async (md) => { window.__copied.push(md); return true }, true)`)
    const centers = await app.evaluate(`[...document.querySelectorAll('.preview .copy-section > button.code-copy')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })`)
    await app.click(centers[0].x, centers[0].y)
    await app.until(`document.querySelector('.preview .copy-section > button.code-copy').classList.contains('copied')`, { label: 'check shown' })
    await app.click(centers[1].x, centers[1].y)
    await sleep(200)
    expect(JSON.stringify(await app.evaluate(`window.__copied`)), 'each section copies its markdown, markers excluded').toBe(JSON.stringify([FIRST, SECOND]))
    expect(await app.evaluate(`document.activeElement === document.querySelector('.preview')`), 'focus stays on the pane').toBe(true)

    await app.click(centers[0].x, centers[0].y, { clicks: 2 })
    await sleep(400)
    expect(await app.previewVisible(), 'still in preview after double-clicking the button').toBe(true)
  } finally {
    await app.close()
  }

  // An answer typed into a response row inside a section is in the copy,
  // even while the answer is still open.
  const answered = await launch({ files: { 'doc.md': ['<!-- copy -->', 'Note.', '', '| BD RESPONSE: | |', '| ------------ | --- |', '<!-- /copy -->', ''].join('\n') } })
  try {
    await sleep(800)
    await answered.evaluate(`(window.__copied = [], $.preview.copyRich = async (md) => { window.__copied.push(md); return true }, true)`)
    const cell = await answered.evaluate(`(() => { const r = document.querySelector('.preview .fs-response-answer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await answered.click(cell.x, cell.y)
    await answered.until(`!!document.querySelector('.preview .fs-editing-cell')`, { label: 'answer editing' })
    await answered.type('Agreed')
    await answered.until(`$.view.state.doc.toString().includes('Agreed')`, { label: 'answer in the source' })
    const button = await answered.evaluate(`(() => { const r = document.querySelector('.preview .copy-section > button.code-copy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await answered.click(button.x, button.y)
    await answered.until(`window.__copied.length === 1`, { label: 'section copied' })
    expect(await answered.evaluate(`window.__copied[0].includes('| BD RESPONSE: | Agreed |')`), 'the copy carries the answer just typed').toBe(true)
  } finally {
    await answered.close()
  }
}
