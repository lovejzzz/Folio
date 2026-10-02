// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { CourseStore, cmd, createSource, project } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { renderDocx, renderPptx } from '../src';

/** Every XML part of an Office file, parsed strictly: what Word and PowerPoint do before they open one. */
function brokenParts(bytes: Uint8Array): string[] {
  const broken = (xml: string): boolean => {
    try {
      return new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('parsererror').length > 0;
    } catch {
      return true;
    }
  };
  return Object.entries(unzipSync(bytes))
    .filter(([name, part]) => /\.(xml|rels)$/.test(name) && broken(strFromU8(part)))
    .map(([name]) => name);
}

const origin = { label: { key: 'test' }, source: 'user' } as never;
const BAD = 'a\u0001b\u000bc\ufffed\ud800e';

describe('text a file can’t carry', () => {
  it('never reaches a Word file, whether in the title, a material or the teacher’s own syllabus', async () => {
    const store = new CourseStore({ ...sampleCourse(), title: `Stats ${BAD}` });
    // A source saved before sources were cleaned as they were added.
    const source = { ...createSource('Syllabus', 'Page one', 'file'), text: `Page one\fPage two ${BAD}` };
    store.apply([cmd('source.add', { source }), cmd('syllabus.own', { sourceId: source.id })], origin);
    const course = store.getState();
    const docs = (['syllabus', 'plan', 'quiz'] as const).map((kind) => project(course, kind, { audience: 'teacher' }));
    expect(brokenParts(await renderDocx(docs, { courseTitle: course.title }))).toEqual([]);
  });

  it('never reaches a slide deck, in a slide’s title, its bullets or its notes', async () => {
    const doc = project(sampleCourse(), 'slides', { audience: 'teacher' });
    const blocks = doc.blocks.map((b) => (b.t === 'slide' ? { ...b, title: `${b.title} ${BAD}`, bullets: [...b.bullets, BAD], notes: `Notes ${BAD}` } : b));
    expect(brokenParts(await renderPptx({ ...doc, title: `Deck ${BAD}`, blocks }))).toEqual([]);
  });
});
