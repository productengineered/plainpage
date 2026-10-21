/* A file written on Windows keeps its \r\n line endings through an edit
 * and a save. The editor holds every document with \n, so without the
 * session's line-ending memory the first ⌘S rewrote every line. */
import { readFile } from 'node:fs/promises'
import { expect, launch, sleep } from '../lib.mjs'

export const name = 'a CRLF file is saved back with CRLF line endings'

export async function run() {
  const app = await launch({ files: { 'win.md': '# Windows\r\n\r\nFirst line.\r\n' } })
  try {
    await sleep(800)
    await app.cmd('e'); await sleep(400)
    await app.evaluate(`(view.dispatch({ selection: { anchor: view.state.doc.length } }), view.focus())`)
    await app.type('Typed here.')
    await app.cmd('s'); await sleep(1200)
    const disk = await readFile(app.paths['win.md'], 'utf8')
    expect(disk, 'every line ends \\r\\n, the new text included').toBe('# Windows\r\n\r\nFirst line.\r\nTyped here.')
  } finally {
    await app.close()
  }
}
