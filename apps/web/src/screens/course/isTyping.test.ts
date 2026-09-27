import { describe, expect, it } from 'vitest';
import { isTyping } from './isTyping';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;

describe('isTyping', () => {
  it('counts text-entry controls, where ⌘Z edits the text', () => {
    expect(isTyping(el('SPAN', { isContentEditable: true }))).toBe(true);
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    for (const type of ['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']) {
      expect(isTyping(el('INPUT', { type })), type).toBe(true);
    }
  });

  it('leaves ⌘Z to the course on checkboxes, radios, buttons and selects', () => {
    for (const type of ['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color']) {
      expect(isTyping(el('INPUT', { type })), type).toBe(false);
    }
    expect(isTyping(el('SELECT'))).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(el('DIV'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
