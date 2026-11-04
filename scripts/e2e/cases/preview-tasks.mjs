/* Task checkboxes tick in preview: a click writes the `x` into the source
 * (and a second click takes it out), the pane stays in preview, and a box
 * after a response answer typed in preview still ticks its own line. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'task checkboxes tick in preview and write to the source'

const doc = [
  '# Tasks',
  '',
  '- [ ] first',
  '  - a note under it',
  '- [x] second',
  '',
  '| BD RESPONSE: | |',
  '| ------------ | --- |',
  '',
  '1. [ ] after the answer',
  ''
].join('\n')

const boxCenter = (n) => `(() => { const r = document.querySelectorAll('.preview input.fs-task-box')[${n}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
const answerCenter = `(() => { const r = document.querySelector('.preview .fs-response-answer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
const source = () => `$.view.state.doc.toString()`

export async function run() {
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)
    expect(await app.evaluate(`document.querySelectorAll('.preview input.fs-task-box:not(:disabled)').length`), 'every task box is live').toBe(3)

    let at = await app.evaluate(boxCenter(0))
    await app.click(at.x, at.y)
    await app.until(`${source()}.includes('- [x] first')`, { label: 'a click ticks the first task in the source' })
    expect(await app.evaluate(`document.querySelectorAll('.preview input.fs-task-box')[0].checked`), 'the box shows ticked').toBe(true)
    expect(await app.previewVisible(), 'still in preview').toBe(true)

    at = await app.evaluate(boxCenter(1))
    await app.click(at.x, at.y)
    await app.until(`${source()}.includes('- [ ] second')`, { label: 'a click unticks the second task' })

    // An answer typed in preview moves the text under later stamps; the
    // box after it must still find its own line.
    at = await app.evaluate(answerCenter)
    await app.click(at.x, at.y)
    await app.until(`!!document.querySelector('.preview .fs-editing-cell')`, { label: 'answer editing' })
    await app.type('Done')
    await app.until(`${source()}.includes('| BD RESPONSE: | Done |')`, { label: 'answer lands' })
    at = await app.evaluate(boxCenter(2))
    await app.click(at.x, at.y)
    await app.until(`${source()}.includes('1. [x] after the answer')`, { label: 'the box after the answer ticks its own line' })
    await app.until(`!document.querySelector('.preview .fs-editing-cell')`, { label: 'the answer finishes' })
    expect(await app.previewVisible(), 'still in preview after all of it').toBe(true)

    const text = await app.evaluate(source())
    expect(text, 'the rest of the file is untouched').toBe(
      doc
        .replace('- [ ] first', '- [x] first')
        .replace('- [x] second', '- [ ] second')
        .replace('| BD RESPONSE: | |\n| ------------ | --- |', '| BD RESPONSE: | Done |\n| ------------ | ---- |')
        .replace('1. [ ] after', '1. [x] after')
    )
  } finally {
    await app.close()
  }
}
