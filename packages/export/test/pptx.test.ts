import { describe, expect, it } from 'vitest';
import { project, type SemanticDoc } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { printPalette } from '@folio/ui/tokens';
import { renderPptx } from '../src';
import { unzipText } from './helpers';

const course = sampleCourse();

function slideBlocks(audience: 'student' | 'teacher') {
  const doc = project(course, 'slides', { audience });
  return { doc, slides: doc.blocks.filter((b) => b.t === 'slide') };
}

function notesText(zip: ReturnType<typeof unzipText>): string {
  return zip.names
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
    .map((n) => zip.text(n))
    .join('\n');
}

describe('renderPptx', () => {
  it('writes one slide per slide block', async () => {
    const { doc, slides } = slideBlocks('teacher');
    expect(slides.length).toBe(20);
    const zip = unzipText(await renderPptx(doc));
    const slideParts = zip.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slideParts.length).toBe(slides.length);
    expect(zip.text('ppt/presentation.xml')).toContain('cx="12192000"');
  });

  it('carries speaker notes only in the teacher copy', async () => {
    const teacher = slideBlocks('teacher');
    const note = teacher.slides.find((s) => s.t === 'slide' && s.notes)?.notes ?? '';
    expect(note).not.toBe('');
    const snippet = note.slice(0, 30).replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    expect(notesText(unzipText(await renderPptx(teacher.doc)))).toContain(snippet);

    const student = slideBlocks('student');
    expect(notesText(unzipText(await renderPptx(student.doc)))).not.toContain(snippet);
  });

  it('puts the lesson label and the slide title on the slide', async () => {
    const { doc, slides } = slideBlocks('student');
    const first = slides[0];
    if (first?.t !== 'slide') throw new Error('no slide');
    const xml = unzipText(await renderPptx(doc)).text('ppt/slides/slide1.xml');
    expect(xml).toContain(first.lesson);
    expect(xml).toContain(first.title);
    const layout = unzipText(await renderPptx(doc)).text('ppt/slideLayouts/slideLayout2.xml');
    expect(layout).toContain(printPalette.paper);
    expect(layout).toContain(printPalette.tab.slides);
  });

  it('still opens with no slides', async () => {
    const doc = project(course, 'slides', { audience: 'student', lessonIds: [] });
    const zip = unzipText(await renderPptx(doc));
    expect(zip.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length).toBe(1);
  });
});

describe('code in slides', () => {
  it('sets code marked with backticks in the mono face, in titles and bullets alike', async () => {
    const doc: SemanticDoc = {
      kind: 'slides',
      title: 'Regression in R',
      subtitle: '',
      language: 'en',
      audience: 'teacher',
      blocks: [
        { t: 'slide', n: 1, layout: 'bullets', title: 'Fitting with `lm()`', bullets: ['Run `lm(log(wage) ~ educ, data = wage1)`', 'Read the output', 'se(β̂_educ) and R^2'], lesson: 'OLS', notes: 'Show `summary()` output.' },
      ],
    };
    const zip = unzipText(await renderPptx(doc));
    const xml = zip.text('ppt/slides/slide1.xml');
    expect(xml).toContain('lm(log(wage) ~ educ, data = wage1)');
    expect(xml).not.toContain('`');
    expect(xml.match(/typeface="Consolas"/g)?.length).toBeGreaterThanOrEqual(2);
    // Each bullet is still one paragraph, with its bullet on the first run.
    expect(xml).toContain('Read the output');
    expect(xml.match(/<a:buChar/g)?.length).toBe(3);
    expect(xml).toMatch(/baseline="-\d+"[^>]*>.*?<a:t>educ<\/a:t>/s);
    expect(xml).toMatch(/baseline="\d+"[^>]*>.*?<a:t>2<\/a:t>/s);
    // One set of paragraph properties per paragraph, before its first run.
    for (const para of xml.match(/<a:p>.*?<\/a:p>/gs) ?? []) {
      expect(para.match(/<a:pPr\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(para).not.toMatch(/<\/a:r><a:pPr/);
    }
    expect(notesText(zip)).toContain('Show summary() output.');
  });
});

describe('text that has to fit its slide', () => {
  const long = 'Students compare the two samples, say which one was chosen at random, and explain in a full sentence how the other could mislead a reader of the survey.';
  const deck = (bullets: string[]): SemanticDoc => ({
    ...project(course, 'slides', { audience: 'teacher', lessonIds: [] }),
    blocks: [{ t: 'slide', n: 1, layout: 'bullets', title: 'How samples mislead', bullets, notes: 'Say it slowly.', lesson: 'Lesson 4' }],
  });
  const sizes = (xml: string) => [...xml.matchAll(/sz="(\d+)"/g)].map((m) => Number(m[1]));

  it('keeps the layout’s own sizes when the words fit', async () => {
    const xml = unzipText(await renderPptx(deck(['Random samples', 'Convenience samples']))).text('ppt/slides/slide1.xml');
    expect(sizes(xml)).toEqual(expect.arrayContaining([3200, 2200]));
  });

  it('sets a long list smaller, never below 14 points', async () => {
    const xml = unzipText(await renderPptx(deck(Array.from({ length: 6 }, () => long)))).text('ppt/slides/slide1.xml');
    const body = sizes(xml).filter((n) => n < 3200);
    expect(Math.max(...body)).toBeLessThan(2200);
    expect(Math.min(...sizes(xml))).toBeGreaterThanOrEqual(1100);
    expect(Math.min(...body.filter((n) => n !== 1100))).toBeGreaterThanOrEqual(1400);
  });

  it('carries a list too long for one slide over to the next, with the notes on the first', async () => {
    const zip = unzipText(await renderPptx(deck(Array.from({ length: 16 }, (_, i) => `${i + 1}. ${long}`))));
    const parts = zip.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
    expect(parts.length).toBeGreaterThan(1);
    expect(zip.text('ppt/slides/slide2.xml')).toContain('How samples mislead (continued)');
    // Every bullet is on some slide, once.
    const all = parts.map((p) => zip.text(p)).join('');
    for (let i = 1; i <= 16; i++) expect(all.split(`>${i}. Students compare`).length - 1).toBe(1);
    expect(notesText(zip)).toContain('Say it slowly.');
    expect(notesText(zip).split('Say it slowly.').length - 1).toBe(1);
  });
});
