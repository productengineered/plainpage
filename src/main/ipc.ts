import { dialog, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname } from 'node:path'
import { DROPPABLE_FILE, IPC, type AppCommand, type ConflictChoice, type RecentFile } from '../shared/types'
import { resolveDocLink, WEB_SCHEMES, type PathProbe } from './doc-link'
import { readTextFile } from './files'
import type { MenuActions } from './menu'
import { showPathMenu } from './path-menu'
import { positions } from './positions-store'
import { setAutosaveEnabled, type WindowSession } from './session'
import { updates } from '#updater'

export const OPENABLE_SCHEMES = WEB_SCHEMES

const probe: PathProbe = {
  kind: (path) => {
    try {
      const stat = statSync(path)
      return stat.isFile() ? 'file' : stat.isDirectory() ? 'dir' : 'missing'
    } catch {
      return 'missing'
    }
  }
}

/* Enough to find Tuesday's file; not a file manager. */
const RECENTS_SHOWN = 10

/* Renderer → main channels, routed to the sender's window session — with
 * several windows open, e.sender.id is the only truth about which window is
 * talking, and the docId argument picks the tab. IPC.content and IPC.state
 * are intentionally absent: they are reply channels consumed (sender- and
 * docId-filtered) by TabSession's renderer roundtrips. */
export function registerIpc(
  sessionFor: (webContentsId: number) => WindowSession | null,
  actions: MenuActions,
  detachTab: (source: WindowSession, docId: number, x: number, y: number) => Promise<void>
): void {
  ipcMain.on(IPC.dirty, (e, docId: number, dirty: boolean) =>
    sessionFor(e.sender.id)?.tab(docId)?.setDirty(dirty)
  )
  ipcMain.on(IPC.conflictResolve, (e, docId: number, choice: ConflictChoice) =>
    sessionFor(e.sender.id)?.tab(docId)?.resolveConflict(choice)
  )
  ipcMain.on(IPC.autosave, (e, docId: number) => void sessionFor(e.sender.id)?.tab(docId)?.autosave())
  ipcMain.on(IPC.position, (e, docId: number, position: unknown) => {
    // The path comes from the tab, never the renderer; the store validates
    // the offsets.
    const path = sessionFor(e.sender.id)?.tab(docId)?.getPath()
    if (path && typeof position === 'object' && position !== null) {
      const p = position as Record<string, unknown>
      if (typeof p['head'] === 'number' && typeof p['top'] === 'number') {
        positions.remember(path, { head: p['head'], top: p['top'] })
      }
    }
  })
  ipcMain.on(IPC.autosaveEnabled, (_e, on: boolean) => setAutosaveEnabled(on === true))
  ipcMain.handle(IPC.historyList, (e, docId: number) =>
    sessionFor(e.sender.id)?.tab(docId)?.listHistory() ?? []
  )
  ipcMain.handle(IPC.historyRead, (e, docId: number, id: string) =>
    typeof id === 'string' ? (sessionFor(e.sender.id)?.tab(docId)?.readHistory(id) ?? null) : null
  )
  ipcMain.on(IPC.tabActivate, (e, docId: number) => sessionFor(e.sender.id)?.activate(docId))
  ipcMain.on(IPC.tabClose, (e, docId: number) => void sessionFor(e.sender.id)?.closeTab(docId))
  ipcMain.on(IPC.tabReorder, (e, docId: number, toIndex: number) =>
    sessionFor(e.sender.id)?.reorder(docId, toIndex)
  )
  ipcMain.on(IPC.tabDetach, (e, docId: number, x: number, y: number) => {
    const session = sessionFor(e.sender.id)
    if (session && Number.isFinite(x) && Number.isFinite(y)) {
      void detachTab(session, docId, x, y)
    }
  })
  ipcMain.on(IPC.pathMenu, (e, docId: unknown) => {
    const session = sessionFor(e.sender.id)
    if (!session) return
    // The path comes from the tab, never the renderer.
    const tab = typeof docId === 'number' ? session.tab(docId) : session.activeTab
    const path = tab?.getPath()
    if (path) void showPathMenu(session.window, path)
  })
  ipcMain.on(IPC.exec, (e, command: AppCommand) => {
    const session = sessionFor(e.sender.id)
    switch (command) {
      case 'window-new':
        return actions.newWindow()
      case 'tab-new':
        return session ? session.newTab() : actions.newTab()
      case 'tab-close':
        return session?.closeActiveTab()
      case 'tab-reopen':
        return actions.reopenClosedTab()
      case 'help-window':
        return actions.help()
      case 'file-open':
        return actions.open()
      case 'file-save':
        return void session?.activeTab?.save()
      case 'file-save-as':
        return void session?.activeTab?.save(true)
      case 'export-html':
        return void session?.activeTab?.exportHtml()
      case 'export-pdf':
        return void session?.activeTab?.exportPdf()
      case 'file-print':
        return void session?.activeTab?.printDoc()
      case 'file-reveal':
        return session?.activeTab?.reveal()
      case 'file-copy-path':
        return session?.activeTab?.copyPath()
      case 'update-restart':
        return actions.updateRestart()
    }
  })
  ipcMain.handle(IPC.pasteImage, (e, bytes: Uint8Array, ext: string, name: unknown) => {
    const tab = sessionFor(e.sender.id)?.activeTab
    if (!tab || !/^[a-z0-9]+$/.test(ext)) return null
    return tab.savePastedImage(bytes, ext, typeof name === 'string' ? name : null)
  })
  ipcMain.handle(IPC.recentFiles, (): RecentFile[] => {
    const home = homedir()
    return positions.recent(RECENTS_SHOWN, existsSync).map((path) => {
      const dir = dirname(path)
      return {
        path,
        name: basename(path),
        dir: dir === home || dir.startsWith(home + '/') ? '~' + dir.slice(home.length) : dir
      }
    })
  })
  ipcMain.on(IPC.openRecent, (_e, path: string) => {
    // Only a path the store handed out — the renderer names nothing else.
    if (typeof path === 'string' && positions.has(path) && existsSync(path)) actions.openFile(path)
  })
  ipcMain.on(IPC.openDropped, (e, path: string) => {
    // Same filter the renderer applies to the drop; main must not trust it.
    if (typeof path === 'string' && DROPPABLE_FILE.test(path)) {
      void sessionFor(e.sender.id)?.openPath(path)
    }
  })
  ipcMain.handle(
    IPC.copyRichText,
    (e, docId: number, fragment?: unknown) =>
      sessionFor(e.sender.id)
        ?.tab(docId)
        ?.copyRichText(typeof fragment === 'string' ? fragment : undefined) ?? false
  )
  ipcMain.handle(IPC.updateCheck, () => updates.checkNow())
  ipcMain.handle(IPC.loadCustomTheme, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSS', extensions: ['css'] }]
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    try {
      return await readTextFile(picked)
    } catch {
      return null
    }
  })
  /* A link clicked in a document (src/main/doc-link.ts). Relative links
   * resolve against the active tab's file — the one the click came from. */
  ipcMain.on(IPC.openExternal, (e, url: unknown) => {
    if (typeof url !== 'string') return
    const session = sessionFor(e.sender.id)
    const link = resolveDocLink(url, session?.activeTab?.getPath() ?? null, probe)
    const failed = (message: string): void => {
      if (message) session?.notify(message)
    }
    switch (link.kind) {
      case 'web':
        void shell.openExternal(link.url)
        break
      case 'tab':
        actions.openFile(link.path)
        break
      case 'file':
      case 'folder':
        void shell.openPath(link.path).then(failed)
        break
      case 'reveal':
        shell.showItemInFolder(link.path)
        break
      case 'error':
        failed(link.message)
        break
      case 'ignore':
        break
    }
  })
}
