/** Input types that take typed text, and so have their own ⌘Z. */
const TEXT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);

interface Target {
  isContentEditable?: boolean;
  tagName?: string;
  type?: string;
}

/**
 * Is the keyboard in a text-entry control, where ⌘Z belongs to the text?
 * Checkboxes, radios, buttons and selects are not: there ⌘Z undoes the course.
 */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as Target | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return TEXT_TYPES.has((el.type ?? '').toLowerCase());
  return false;
}
