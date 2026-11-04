/* ⌘F in preview opens a find bar on the page instead of leaving it: typing
 * highlights every match (one inside bold included), Enter / Shift+Enter
 * and ⌘G step through them and scroll the current one into view, Escape
 * closes the bar and stays in preview, and the query carries over to the
 * editor's find after ⌘E. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'find works in preview without leaving it, and shares its query with the editor'

const filler = Array.from({ length: 60 }, (_, i) => `Filler paragraph ${i} about nothing in particular.`)
const doc = ['# Fruit', '', 'An apple a day.', '', 'A pine**apple** is not one.', '', ...filler.flatMap((p) => [p, '']), 'The last Apple is far down.', ''].join('\n')

const count = `document.querySelector('.preview .preview-find .find-count').textContent`
const highlighted = (name) => `CSS.highlights.get('${name}')?.size ?? 0`
const currentText = `(() => { const h = CSS.highlights.get('fs-find-current'); if (!h) return ''; const [r] = [...h]; return r.toString() })()`

export async function run() {
  const app = await launch({ files: { 'doc.md': doc } })
  try {
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)

    await app.cmd('f')
    await app.until(`!document.querySelector('.preview .preview-find').hidden`, { label: 'find bar opens' })
    expect(await app.previewVisible(), '⌘F stays in preview').toBe(true)
    expect(await app.evaluate(`document.activeElement === document.querySelector('.preview .preview-find input')`), 'the bar has focus').toBe(true)

    await app.type('apple')
    await app.until(`${count} === '1 of 3'`, { label: 'three matches, the first current' })
    expect(await app.evaluate(highlighted('fs-find')), 'every match is painted').toBe(3)
    expect(JSON.stringify(await app.evaluate(`[...CSS.highlights.get('fs-find')].map(r => r.toString())`)), 'the bold one included').toBe(JSON.stringify(['apple', 'apple', 'Apple']))

    await app.key('Enter')
    await app.until(`${count} === '2 of 3'`, { label: 'Enter steps forward' })
    await app.key('Enter')
    await app.until(`${count} === '3 of 3'`, { label: 'to the last' })
    expect(await app.evaluate(currentText), 'the far match is current').toBe('Apple')
    const inView = await app.evaluate(`(() => { const [r] = [...CSS.highlights.get('fs-find-current')]; const b = r.getBoundingClientRect(); const p = document.querySelector('.preview').getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom })()`)
    expect(inView, 'the far match scrolled into view').toBe(true)

    await app.key('Enter', ['shift'])
    await app.until(`${count} === '2 of 3'`, { label: 'Shift+Enter steps back' })
    await app.key('g', ['meta'])
    await app.until(`${count} === '3 of 3'`, { label: '⌘G steps forward' })
    await app.cmd('f')
    await sleep(200)
    expect(await app.evaluate(count), 'a second ⌘F keeps the place').toBe('3 of 3')

    await app.key('Escape')
    await app.until(`document.querySelector('.preview .preview-find').hidden`, { label: 'Escape closes the bar' })
    expect(await app.previewVisible(), 'Escape in the bar stays in preview').toBe(true)
    expect(await app.evaluate(highlighted('fs-find')), 'highlights cleared').toBe(0)

    // The query carries to the editor's find.
    await app.cmd('e')
    await app.until(`document.querySelector('.preview').hidden`, { label: 'editor shown' })
    await sleep(300)
    await app.cmd('f')
    await app.until(`!!document.querySelector('.cm-panels .find-input')`, { label: 'editor find opens' })
    expect(await app.evaluate(`document.querySelector('.cm-panels .find-input').value`), 'same query in the editor').toBe('apple')

    // A newer editor query comes back to preview.
    await app.evaluate(`(() => { const i = document.querySelector('.cm-panels .find-input'); i.value = 'Filler'; i.dispatchEvent(new Event('input')); return true })()`)
    await app.key('Escape')
    await sleep(200)
    await app.cmd('e')
    await app.until(`!document.querySelector('.preview').hidden`, { label: 'back in preview' })
    await sleep(300)
    await app.cmd('f')
    await app.until(`document.querySelector('.preview .preview-find input').value === 'Filler'`, { label: 'the editor query wins' })
  } finally {
    await app.close()
  }
}
