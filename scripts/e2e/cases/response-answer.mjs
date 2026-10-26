/* A response table's answer cell takes typing in preview: a click starts
 * the answer, each keystroke lands in the source, Enter finishes and the
 * pane stays in preview; Escape finishes without leaving preview; a
 * double-click inside an answer doesn't drop to the editor. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'response answers are typed in preview and written to the source'

const doc = [
  '# Feedback',
  '',
  'See [the thread](https://example.com/thread).',
  '',
  '| BD RESPONSE: | |',
  '| ------------ | --- |',
  '',
  'Between the two.',
  '',
  '| BD RESPONSE: | |',
  '| ------------ | --- |',
  ''
].join('\n')

const answerCenter = (n) => `(() => { const r = document.querySelectorAll('.preview .fs-response-answer')[${n}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
const source = () => `$.view.state.doc.toString()`

export async function run() {
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)
    expect(await app.evaluate(`document.querySelectorAll('.preview .fs-response-answer').length`), 'each response table has an answer cell').toBe(2)

    // First answer: click, type, Enter.
    let at = await app.evaluate(answerCenter(0))
    await app.click(at.x, at.y)
    await app.until(`!!document.querySelector('.preview .fs-editing-cell')`, { label: 'answer editing' })
    await app.type('Looks good')
    await app.until(`${source()}.includes('| BD RESPONSE: | Looks good |')`, { label: 'typing lands in the source' })
    await app.key('Enter')
    await app.until(`!document.querySelector('.preview .fs-editing-cell')`, { label: 'Enter finishes' })
    expect(await app.previewVisible(), 'still in preview after Enter').toBe(true)
    expect(await app.evaluate(`document.querySelectorAll('.preview .fs-response-answer')[0].textContent`), 'the answer shows in the page').toBe('Looks good')

    // Second answer, after the first table grew: Escape finishes, stays.
    at = await app.evaluate(answerCenter(1))
    await app.click(at.x, at.y)
    await app.until(`!!document.querySelector('.preview .fs-editing-cell')`, { label: 'second answer editing' })
    await app.type('Skip this one')
    await app.key('Escape')
    await app.until(`!document.querySelector('.preview .fs-editing-cell')`, { label: 'Escape finishes' })
    expect(await app.previewVisible(), 'Escape does not leave preview').toBe(true)
    const text = await app.evaluate(source())
    expect(text.includes('| BD RESPONSE: | Skip this one |'), 'second answer in the source').toBe(true)
    expect(text.includes('Between the two.') && text.includes('See [the thread](https://example.com/thread).'), 'the rest of the document is untouched').toBe(true)

    // A double-click inside an answer selects text; it doesn't drop to the editor.
    at = await app.evaluate(answerCenter(0))
    await app.click(at.x, at.y, { clicks: 2 })
    await sleep(400)
    expect(await app.previewVisible(), 'double-clicking an answer stays in preview').toBe(true)
    await app.key('Escape')
    await sleep(200)
    expect(await app.previewVisible(), 'and Escape from it stays too').toBe(true)
  } finally {
    await app.close()
  }
}
