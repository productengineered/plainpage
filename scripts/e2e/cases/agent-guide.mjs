/* Copy Instructions for Agents: the palette command puts the guide on the
 * clipboard as a prompt (the clipboard is stubbed: an e2e run must not
 * clobber the developer's own), with the initials from Settings in its
 * response rows; one topic copies only that topic. */
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'agent instructions copy as a prompt, labelled with your initials'

const runPalette = async (app, query) => {
  await app.cmd('k')
  await app.until(`!!document.querySelector('.palette-input')`, { label: 'palette open' })
  await app.type(query)
  await sleep(150)
  await app.key('Enter')
}

export async function run() {
  const app = await launch({ files: { 'doc.md': '# Notes\n' } })
  try {
    await sleep(800)
    await app.evaluate(`(window.__copied = [], localStorage.removeItem('foolscap:initials'), Object.defineProperty(navigator.clipboard, 'writeText', { value: async (t) => { window.__copied.push(t) } }), true)`)

    await runPalette(app, 'agents all')
    await app.until(`window.__copied.length === 1`, { label: 'all features copied' })
    let text = await app.evaluate(`window.__copied[0]`)
    expect(text, 'a prompt, not the raw guide').toContain('# Writing documents for me in Plainpage')
    expect(text, 'no initials set: the example label').toContain('for example `BD RESPONSE:`')
    for (const heading of ['## Response rows', '## Copy sections', '## Task lists']) {
      expect(text, `all features include ${heading}`).toContain(heading)
    }
    await app.until(`[...document.querySelectorAll('.notice')].some(t => t.textContent.includes('Instructions copied'))`, { label: 'a toast confirms the copy' })

    // Initials through Settings ▸ Agents, as the user types them.
    await runPalette(app, 'settings')
    await app.until(`!!document.querySelector('.settings-input')`, { label: 'settings open with the initials field' })
    await app.evaluate(`document.querySelector('.settings-input').focus()`)
    await app.type('js')
    await app.until(`localStorage.getItem('foolscap:initials') === 'JS'`, { label: 'initials stored, upper case' })
    await app.key('Escape')
    await app.until(`!document.querySelector('.settings')`, { label: 'settings closed' })

    await runPalette(app, 'agents response')
    await app.until(`window.__copied.length === 2`, { label: 'response rows copied' })
    text = await app.evaluate(`window.__copied[1]`)
    expect(text, 'the prompt names your initials').toContain('My initials are JS, so label response rows `JS RESPONSE:`.')
    expect(text, 'examples carry your initials').toContain('| JS RESPONSE: | |')
    expect(text.includes('BD'), 'no example initials left').toBe(false)
    expect(text.includes('## Copy sections'), 'one topic only').toBe(false)
  } finally {
    await app.evaluate(`localStorage.removeItem('foolscap:initials')`).catch(() => {})
    await app.close()
  }
}
