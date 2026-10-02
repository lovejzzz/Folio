import { describe, expect, it } from 'vitest';
import { shortcut } from './shortcut';

describe('a shortcut', () => {
  it('is shown as a Mac labels it on a Mac, and with Ctrl and Shift elsewhere', () => {
    expect(shortcut('⇧⌘Z', true)).toBe('⇧⌘Z');
    expect(shortcut('⌘K', false)).toBe('Ctrl+K');
    expect(shortcut('⇧⌘Z', false)).toBe('Ctrl+Shift+Z');
  });
});
