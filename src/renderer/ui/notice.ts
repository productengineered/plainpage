import type { ConflictChoice } from '../../shared/types'
import { tokenMs } from './tokens'

let bar: HTMLElement | null = null

/* Non-modal external-change bar per ULTRAPLAN §6. Shown only when the buffer
 * is dirty and the file changed on disk; the clean case reloads silently in
 * the main process. Escape or "Keep mine" keeps the buffer. */
export function showConflictBar(onChoice: (choice: ConflictChoice) => void): void {
  if (bar) return // already showing; main may re-notify on further disk writes

  bar = document.createElement('div')
  bar.className = 'notice'
  bar.setAttribute('role', 'alertdialog')
  bar.setAttribute('aria-label', 'File changed on disk')

  const label = document.createElement('span')
  label.textContent = 'This file changed on disk.'

  const choose = (choice: ConflictChoice): void => {
    hideConflictBar()
    onChoice(choice)
  }

  const reload = document.createElement('button')
  reload.className = 'primary'
  reload.textContent = 'Reload'
  reload.addEventListener('click', () => choose('reload'))

  const keep = document.createElement('button')
  keep.textContent = 'Keep mine'
  keep.addEventListener('click', () => choose('keep'))

  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') choose('keep')
  })

  bar.append(label, reload, keep)
  document.body.append(bar)
  reload.focus()
}

export function hideConflictBar(): void {
  bar?.remove()
  bar = null
}

/* Transient toasts hold a single slot: a new one replaces whatever is
 * showing, so "Checking for updates…" morphs into its answer instead of
 * stacking on top of it. The conflict bar is separate and never bumped. */
let activeToast: HTMLElement | null = null

function mountToast(toast: HTMLElement, lifetimeMs: number): void {
  activeToast?.remove()
  activeToast = toast
  document.body.append(toast)
  setTimeout(() => {
    if (activeToast === toast) activeToast = null
    toast.remove()
  }, lifetimeMs)
}

/* Transient, self-dismissing notice for minor feedback. */
export function showToast(message: string): void {
  const toast = document.createElement('div')
  toast.className = 'notice'
  toast.setAttribute('role', 'status')
  toast.textContent = message
  mountToast(toast, tokenMs('--dur-toast'))
}

/* A newer release exists. Main sends this at most once per version, so the
 * toast can afford to linger — but it is still a toast: dismissible,
 * non-modal, and it never comes back after "Later". */
/* The update is downloaded, verified, and waiting. "Later" costs nothing:
 * the update applies on whatever quit comes naturally. */
export function showUpdateReadyToast(version: string, onRestart: () => void): void {
  const toast = document.createElement('div')
  toast.className = 'notice'
  toast.setAttribute('role', 'status')

  const label = document.createElement('span')
  label.textContent = `Plainpage ${version} is ready.`

  const restart = document.createElement('button')
  restart.className = 'primary'
  restart.textContent = 'Restart now'
  restart.addEventListener('click', () => {
    toast.remove()
    onRestart()
  })

  const later = document.createElement('button')
  later.textContent = 'On next quit'
  later.addEventListener('click', () => toast.remove())

  toast.append(label, restart, later)
  mountToast(toast, tokenMs('--dur-toast-update'))
}
