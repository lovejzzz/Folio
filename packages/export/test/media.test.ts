import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { orderedLessons, parseCourse, project, type PageBlock } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describeExport, exportCourse, readFolio, readFolioFile, renderDocx, writeFolio, zipFiles, type FolioMedia, type MediaResolver } from '../src';

/** A one-pixel PNG. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const CLIP = strToU8('not really a video');
const ZIP = strToU8('not really a zip');

const media = { alt: 'The arena from above', shows: 'The whole arena.' };
const page: PageBlock[] = [
  { id: 'x_h', type: 'heading', level: 2, text: 'Build the arena' },
  { id: 'x_i', type: 'image', src: 'media:m_pic.png', caption: 'The finished arena', ...media },
  { id: 'x_j', type: 'image', src: 'media:m_gone.png', caption: 'Added on another device', ...media },
  { id: 'x_v', type: 'video', src: 'media:m_clip.mp4', poster: 'media:m_poster.png', caption: 'Rolling the ball', minutes: 2, transcript: '', clip: false, ...media },
  { id: 'x_f', type: 'file', href: 'media:m_start.zip', label: 'Arena.zip', role: 'starter', shows: '' },
];

const base = sampleCourse();
const first = orderedLessons(base)[0]!;
const course = parseCourse({ ...base, delivery: 'online-async', lessons: { ...base.lessons, [first.id]: { ...first, page } } });

const HELD: Record<string, { bytes: Uint8Array; type: string; name: string }> = {
  'media:m_pic.png': { bytes: PNG, type: 'image/png', name: 'Screenshot 1.png' },
  'media:m_poster.png': { bytes: PNG, type: 'image/png', name: 'poster.png' },
  'media:m_clip.mp4': { bytes: CLIP, type: 'video/mp4', name: 'roll.mp4' },
  'media:m_start.zip': { bytes: ZIP, type: 'application/zip', name: 'start.zip' },
};
/** A device that holds everything but the picture added elsewhere. */
const resolver: MediaResolver = async (ref, use) => {
  const found = HELD[ref];
  if (!found) return null;
  const picture = use === 'picture' && found.type.startsWith('image/');
  return { ...found, width: picture ? 800 : 0, height: picture ? 400 : 0 };
};

describe('pictures in a Word file', () => {
  const docs = [project(course, 'plan', { audience: 'teacher', lessonIds: [first.id] })];

  it('embeds each picture this device has, with its relationship, at the width of the text or less', async () => {
    const parts = unzipSync(await renderDocx(docs, { courseTitle: course.title, media: resolver }));
    // One file for each picture: the page's own, and the video's poster.
    const pictures = Object.keys(parts).filter((n) => /^word\/media\/.+\.png$/.test(n));
    expect(pictures).toHaveLength(2);
    expect([...parts[pictures[0]!]!]).toEqual([...PNG]);
    const rels = strFromU8(parts['word/_rels/document.xml.rels']!);
    for (const name of pictures) expect(rels).toMatch(new RegExp(`Id="(rIdPicture\\d)" Type="[^"]+/relationships/image" Target="${name.replace('word/', '')}"`));
    const xml = strFromU8(parts['word/document.xml']!);
    expect(xml.match(/<pic:pic\b/g)).toHaveLength(2);
    expect(xml).toContain('<a:blip r:embed="rIdPicture1"/>');
    expect(xml).toContain('descr="The arena from above"');
    expect(xml).not.toContain('FOLIO-PICTURE');
    // 800 by 400 pixels fits Letter's text width (about 625): scaled down, the shape kept.
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!;
    expect(Number(cx) / Number(cy)).toBeCloseTo(2, 1);
    expect(Number(cx)).toBeLessThan(800 * 9525);
    expect(xml).toContain('The finished arena');
    expect(xml).toContain('Video, 2 min: Rolling the ball (file: media/week-1-3-rolling-the-ball.mp4)');
  });

  it('says in words a picture it cannot read, and every picture when no one resolves them', async () => {
    const withMedia = strFromU8(unzipSync(await renderDocx(docs, { courseTitle: course.title, media: resolver }))['word/document.xml']!);
    expect(withMedia).toContain('Added on another device: The arena from above');
    const parts = unzipSync(await renderDocx(docs, { courseTitle: course.title }));
    expect(Object.keys(parts).some((n) => /^word\/media\/./.test(n))).toBe(false);
    expect(strFromU8(parts['word/document.xml']!)).toContain('The finished arena: The arena from above');
  });
});

describe('the media folder of a zip', () => {
  const req = { course, kinds: ['plan' as const], audience: 'teacher' as const, format: 'zip' as const };

  it('holds each picture, clip and file under a name that says where it goes', async () => {
    const parts = unzipSync((await exportCourse(req, { media: resolver })).bytes);
    const names = Object.keys(parts).filter((n) => n.startsWith('media/'));
    expect(names.sort()).toEqual(['media/Arena.zip', 'media/week-1-1-the-finished-arena.png', 'media/week-1-3-rolling-the-ball.mp4']);
    expect([...parts['media/week-1-1-the-finished-arena.png']!]).toEqual([...PNG]);
    expect(strFromU8(parts['media/Arena.zip']!)).toBe('not really a zip');
    // What the export says it holds, before anything is made: the picture this device lacks is named too.
    expect(describeExport(req).contents).toContain('media/week-1-2-added-on-another-device.png');
  });

  it('is left out with the pages, and for another week', async () => {
    const quiz = unzipSync((await exportCourse({ ...req, kinds: ['quiz'] }, { media: resolver })).bytes);
    expect(Object.keys(quiz).some((n) => n.startsWith('media/'))).toBe(false);
    const second = orderedLessons(course)[1]!;
    const other = unzipSync((await exportCourse({ ...req, lessonIds: [second.id] }, { media: resolver })).bytes);
    expect(Object.keys(other).some((n) => n.startsWith('media/'))).toBe(false);
  });

  it('carries a backup that has the media too', async () => {
    const parts = unzipSync((await exportCourse(req, { media: resolver })).bytes);
    const backup = Object.keys(parts).find((n) => n.endsWith('.folio'))!;
    const read = readFolioFile(parts[backup]!);
    expect(read.media.map((m) => m.id).sort()).toEqual(['m_clip.mp4', 'm_pic.png', 'm_poster.png', 'm_start.zip']);
  });
});

describe('media in a .folio file', () => {
  const held: FolioMedia[] = [
    { id: 'm_pic.png', name: 'Screenshot 1.png', type: 'image/png', bytes: PNG },
    { id: 'm_clip.mp4', name: 'roll.mp4', type: 'video/mp4', bytes: CLIP },
  ];

  it('round-trips a course with its media', () => {
    const file = writeFolio(course, undefined, held);
    const read = readFolioFile(file);
    expect(read.course).toEqual(course);
    expect(read.media.map(({ bytes, ...rest }) => ({ ...rest, bytes: [...bytes] }))).toEqual(held.map(({ bytes, ...rest }) => ({ ...rest, bytes: [...bytes] })));
    // The course alone opens as before, its media left packed.
    expect(readFolio(file)).toEqual(course);
    expect(JSON.parse(strFromU8(unzipSync(file)['media.json']!))).toEqual([
      { id: 'm_pic.png', name: 'Screenshot 1.png', type: 'image/png' },
      { id: 'm_clip.mp4', name: 'roll.mp4', type: 'video/mp4' },
    ]);
  });

  it('opens a backup with no media', () => {
    expect(readFolioFile(writeFolio(course))).toEqual({ course, media: [] });
  });

  it('reads only what media.json lists and the course still uses, never a path', () => {
    const parts = unzipSync(writeFolio(course));
    const list = [
      { id: 'm_pic.png', name: 'a.png', type: 'image/png' },
      { id: 'm_unused.png', name: 'b.png', type: 'image/png' },
      { id: '../evil', name: 'c', type: '' },
      { id: 'm_clip.mp4', name: 'listed, not packed', type: 'video/mp4' },
    ];
    const file = zipFiles([
      { name: 'manifest.json', bytes: parts['manifest.json']! },
      { name: 'course.json', bytes: parts['course.json']! },
      { name: 'media.json', bytes: strToU8(JSON.stringify(list)) },
      { name: 'media/m_pic.png', bytes: PNG },
      { name: 'media/m_unused.png', bytes: PNG },
      { name: 'media/m_start.zip', bytes: ZIP },
    ]);
    expect(readFolioFile(file).media.map((m) => m.id)).toEqual(['m_pic.png']);
  });

  it('refuses a list of media that is not a list', () => {
    const parts = unzipSync(writeFolio(course));
    const file = zipFiles([
      { name: 'manifest.json', bytes: parts['manifest.json']! },
      { name: 'course.json', bytes: parts['course.json']! },
      { name: 'media.json', bytes: strToU8('{"id":"m_pic.png"}') },
    ]);
    expect(() => readFolioFile(file)).toThrow(expect.objectContaining({ code: 'damagedFile' }));
  });
});
