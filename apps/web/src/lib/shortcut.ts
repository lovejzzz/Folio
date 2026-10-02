/** Apple's keyboards have ⌘ and ⇧; everyone else's are labelled Ctrl and Shift. */
const APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** A shortcut written the Mac way ("⇧⌘Z"), as this computer's keyboard labels it ("Ctrl+Shift+Z" off a Mac). */
export function shortcut(keys: string, apple = APPLE): string {
  if (apple) return keys;
  const parts: string[] = [];
  if (keys.includes('⌘')) parts.push('Ctrl');
  if (keys.includes('⇧')) parts.push('Shift');
  if (keys.includes('⌥')) parts.push('Alt');
  return [...parts, keys.replace(/[⌘⇧⌥]/g, '')].join('+');
}
