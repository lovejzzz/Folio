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
        { t: 'slide', n: 1, layout: 'bullets', title: 'Fitting with `lm()`', bullets: ['Run `lm(log(wage) ~ educ, data = wage1)`', 'Read the output'], lesson: 'OLS', notes: 'Show `summary()` output.' },
      ],
    };
    const zip = unzipText(await renderPptx(doc));
    const xml = zip.text('ppt/slides/slide1.xml');
    expect(xml).toContain('lm(log(wage) ~ educ, data = wage1)');
    expect(xml).not.toContain('`');
    expect(xml.match(/typeface="Consolas"/g)?.length).toBeGreaterThanOrEqual(2);
    // Each bullet is still one paragraph, with its bullet on the first run.
    expect(xml).toContain('Read the output');
    expect(xml.match(/<a:buChar/g)?.length).toBe(2);
    // One set of paragraph properties per paragraph, before its first run.
    for (const para of xml.match(/<a:p>.*?<\/a:p>/gs) ?? []) {
      expect(para.match(/<a:pPr\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(para).not.toMatch(/<\/a:r><a:pPr/);
    }
    expect(notesText(zip)).toContain('Show summary() output.');
  });
});
