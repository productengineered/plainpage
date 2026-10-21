/* Off macOS an app lives in its windows: closing the last one is quitting
 * (window-all-closed quits there), and the silent ⌘Q path — session saved,
 * drafts kept, nothing asked — is what quitting means here. Without this the
 * last window's close would walk the unsaved guard and forget the desk. */
export function closeQuits(platform: NodeJS.Platform, windowCount: number, quitting: boolean): boolean {
  return platform !== 'darwin' && windowCount === 1 && !quitting
}
