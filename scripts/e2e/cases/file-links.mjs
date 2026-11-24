/* Links between files: clicking a relative link to a markdown file in
 * preview opens it in a new tab (main resolves it against the document's
 * folder), a second click brings that tab back instead of a duplicate, and
 * a link to a missing file says so in a toast. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'a link to another markdown file opens it in a tab'

const doc = '# Status\n\n- [Week 3 review](reviews/week%203.md)\n- [Missing](gone.md)\n'
const linkCenter = (href) => `(() => { const r = document.querySelector('.preview:not([hidden]) a[href="${href}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`

export async function run() {
  const app = await launch({ files: { 'status.md': doc } })
  try {
    // On disk but not open: only the link can bring it in.
    await mkdir(join(app.docs, 'reviews'))
    await writeFile(join(app.docs, 'reviews', 'week 3.md'), '# Week 3\n\nLooks good.\n')
    await sleep(800)
    expect(await app.previewVisible(), 'opens in preview').toBe(true)

    let at = await app.evaluate(linkCenter('reviews/week%203.md'))
    await app.click(at.x, at.y)
    await app.until(`$.tabs().tabs.length === 2`, { label: 'the linked file opens as a second tab' })
    await app.until(`$.tabs().tabs.find((t) => t.docId === $.tabs().active)?.name === 'week 3.md'`, { label: 'and becomes the active tab' })
    await app.until(`document.querySelector('.preview:not([hidden]) h1')?.textContent === 'Week 3'`, { label: 'showing its contents' })

    // Back to the status board and click again: the open tab is reused.
    const first = await app.evaluate(`$.tabs().tabs[0].docId`)
    await app.evaluate(`(window.foolscap.tabActivate(${first}), true)`)
    await app.until(`document.querySelector('.preview:not([hidden]) h1')?.textContent === 'Status'`, { label: 'back on the status board' })
    at = await app.evaluate(linkCenter('reviews/week%203.md'))
    await app.click(at.x, at.y)
    await app.until(`$.tabs().tabs.find((t) => t.docId === $.tabs().active)?.name === 'week 3.md'`, { label: 'the second click switches to the open tab' })
    expect(await app.evaluate(`$.tabs().tabs.length`), 'no duplicate tab').toBe(2)

    await app.evaluate(`(window.foolscap.tabActivate(${first}), true)`)
    await app.until(`document.querySelector('.preview:not([hidden]) h1')?.textContent === 'Status'`, { label: 'status board again' })
    at = await app.evaluate(linkCenter('gone.md'))
    await app.click(at.x, at.y)
    await app.until(`[...document.querySelectorAll('.notice')].some((n) => n.textContent.includes('No file at') && n.textContent.includes('gone.md'))`, { label: 'a missing file says so' })
    expect(await app.evaluate(`$.tabs().tabs.length`), 'nothing opened for it').toBe(2)
  } finally {
    await app.close()
  }
}
