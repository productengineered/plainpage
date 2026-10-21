/* Shortcut text for the platform it's shown on. macOS writes glyphs in
 * Apple's order (⌃⌥⇧⌘T); Windows and Linux spell them out (Ctrl+Shift+T).
 * `mod` is the command key: ⌘ on macOS, Ctrl elsewhere — the same mapping
 * Electron's CmdOrCtrl and CodeMirror's Mod- make. */

export type Modifier = 'mod' | 'ctrl' | 'alt' | 'shift'

const MAC_GLYPH: Record<Modifier, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘' }
const MAC_ORDER: Modifier[] = ['ctrl', 'alt', 'shift', 'mod']
const PC_ORDER: Modifier[] = ['mod', 'ctrl', 'alt', 'shift']
const PC_NAME: Record<Modifier, string> = { mod: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }

const isModifier = (part: string): part is Modifier => part in MAC_GLYPH

export function formatKeys(platform: string, parts: string[]): string {
  const mods = new Set(parts.filter(isModifier))
  const key = parts.filter((p) => !isModifier(p)).join('')
  if (platform === 'darwin') {
    return MAC_ORDER.filter((m) => mods.has(m)).map((m) => MAC_GLYPH[m]).join('') + key
  }
  // mod and ctrl are both Ctrl here; say it once.
  const names = [...new Set(PC_ORDER.filter((m) => mods.has(m)).map((m) => PC_NAME[m]))]
  return [...names, ...(key ? [key] : [])].join('+')
}

export function keys(...parts: string[]): string {
  return formatKeys(window.foolscap.platform, parts)
}

const GLYPH_MOD: Record<string, Modifier> = { '⌃': 'ctrl', '⌥': 'alt', '⇧': 'shift', '⌘': 'mod' }

/* Text written for macOS, retold for this platform. Blocks fenced with
 * <!-- mac --> … <!-- /mac --> or <!-- pc --> … <!-- /pc --> are kept
 * only where they apply; elsewhere every glyph run (⇧⌘K, a bare ⌘ before
 * -click) is respelled. */
export function localizeKeys(text: string, platform: string): string {
  const mac = platform === 'darwin'
  const drop = mac ? 'pc' : 'mac'
  const kept = text
    .replace(new RegExp(`<!-- ${drop} -->[\\s\\S]*?<!-- /${drop} -->\\n?`, 'g'), '')
    .replace(/<!-- \/?(mac|pc) -->\n?/g, '')
  if (mac) return kept
  return kept.replace(/([⌃⌥⇧⌘]+)([A-Za-z0-9]+|[^\s`⌃⌥⇧⌘|A-Za-z0-9]?)/g, (_m, glyphs: string, key: string) =>
    formatKeys(platform, [...[...glyphs].map((g) => GLYPH_MOD[g] ?? g), key.replace('−', '-')])
  )
}
