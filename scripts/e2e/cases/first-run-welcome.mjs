/* First launch opens help over a welcome page, not a blank Untitled:
 * double-clicking help away used to leave a near-empty window that read as
 * the app vanishing. The welcome page is clean (closing it asks nothing)
 * and appears only once — a second fresh tab is the plain template. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'first launch: help sits over a welcome page that double-click reveals'

export async function run() {
  const app = await launch({ keepHelp: true })
  try {
    await sleep(600)
    expect(await app.evaluate(`!document.querySelectorAll('.preview')[1].hidden`), 'help shows on first launch').toBe(true)
    expect(await app.evaluate(`document.querySelectorAll('.preview')[1].textContent.includes('double-click anywhere on this page')`), 'help says how to close it').toBe(true)
    await app.click(600, 450, { clicks: 2 }); await sleep(600)
    expect(await app.evaluate(`document.querySelectorAll('.preview')[1].hidden`), 'double-click closes help').toBe(true)
    expect(await app.evaluate(`view.state.doc.toString().startsWith('# Welcome to Plainpage')`), 'welcome page underneath').toBe(true)
    expect(await app.evaluate(`$.tabs().tabs[0].dirty`), 'welcome page is clean').toBe(false)
    expect(await app.evaluate(`$.tabs().tabs[0].path`), 'welcome page is untitled').toBe(null)
    await app.evaluate(`window.foolscap.exec('tab-new')`); await sleep(600)
    expect(await app.evaluate(`view.state.doc.toString()`), 'a later new tab is the plain template').toBe('# \n\n')
  } finally {
    await app.close()
  }
}
