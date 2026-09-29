import { describe, expect, it } from 'vitest';
import { parsePartialJson } from '../src';

const full = JSON.stringify({
  keyIdeas: ['Light drives it', 'Sugar is made'],
  segments: [
    { kind: 'warmup', title: 'Leaf in the dark', minutes: 10, description: 'Compare two leaves: "lit" and dark.\nThen talk.', teacherNotes: '' },
    { kind: 'teach', title: 'The equation', minutes: 20, description: 'Walk through it.', teacherNotes: 'Balance it.' },
  ],
  done: true,
  note: null,
  ratio: -1.5e3,
});

describe('reading JSON as it streams in', () => {
  it('reads every prefix of an answer without throwing, and the whole answer exactly', () => {
    for (let i = 0; i <= full.length; i++) expect(() => parsePartialJson(full.slice(0, i))).not.toThrow();
    expect(parsePartialJson(full)).toEqual(JSON.parse(full));
  });

  it('only ever grows: each prefix reads as at least as much as the one before', () => {
    let last = '';
    for (let i = 0; i <= full.length; i++) {
      const value = parsePartialJson(full.slice(0, i));
      if (value === undefined) continue;
      const titles = ((value as { segments?: { title?: string }[] }).segments ?? []).map((s) => s.title ?? '').join('|');
      expect(titles.startsWith(last) || last.startsWith(titles.slice(0, -1))).toBe(true);
      last = titles;
    }
  });

  it('shows a string as far as it has come', () => {
    expect(parsePartialJson('{"segments":[{"title":"Leaf in th')).toEqual({ segments: [{ title: 'Leaf in th' }] });
    expect(parsePartialJson('{"a":"say \\"hi')).toEqual({ a: 'say "hi' });
    expect(parsePartialJson('{"a":"line\\')).toEqual({ a: 'line' });
    expect(parsePartialJson('{"a":"x\\u00')).toEqual({ a: 'x' });
  });

  it('leaves out a key with no value yet, and a word or number cut off', () => {
    expect(parsePartialJson('{"a":"x","b')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a":"x","b"')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a":"x","b": ')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a":1,"b":tr')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b":-')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":[1,2,')).toEqual({ a: [1, 2] });
  });

  it('is nothing before an object begins, and skips what comes before it', () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('Here it is: ')).toBeUndefined();
    expect(parsePartialJson('```json\n{"a":"b')).toEqual({ a: 'b' });
  });
});
