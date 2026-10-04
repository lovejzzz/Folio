import { describe, expect, it } from 'vitest';
import { isFileName, isLocalMedia, localMediaId, localMediaRef, mediaFileNames, orderedLessons, pageMediaRefs, parseCourse, project, type PageBlock } from '../src';
import { sampleCourse } from '../src/sample';

const shot = (src: string, caption = '') => ({ src, alt: 'The Inspector', caption, shows: 'The Inspector with Floor selected.' });

const page: PageBlock[] = [
  { id: 'x_h', type: 'heading', level: 2, text: 'Build the arena' },
  { id: 'x_i', type: 'image', ...shot('media:m_one.webp', 'The finished arena, seen from above') },
  { id: 'x_p', type: 'image', ...shot('/samples/unity/media/w01.webp') },
  { id: 'x_s', type: 'steps', items: [{ id: 'x_1', text: 'Make a cube.' }, { id: 'x_2', text: 'Name it Floor.', shot: shot('media:m_two.png') }, { id: 'x_3', text: 'Save.', shot: shot('') }] },
  { id: 'x_v', type: 'video', ...shot('media:m_clip.mp4', 'Rolling the ball'), poster: 'media:m_poster.webp', minutes: 4, transcript: 'First we roll.', clip: false },
  { id: 'x_f', type: 'file', href: 'media:m_zip.zip', label: 'Arena.zip', role: 'starter', shows: 'The project as it starts.' },
  { id: 'x_g', type: 'file', href: 'media:m_pdf.pdf', label: 'The handout', role: 'resource', shows: '' },
  { id: 'x_e', type: 'file', href: '', label: 'Later.zip', role: 'resource', shows: 'To come.' },
];

function online() {
  const course = sampleCourse();
  const [first, second] = orderedLessons(course);
  const kit = { announcement: 'Welcome.', watchFor: [], feedback: [], atRisk: '', leaves: [] };
  const again: PageBlock[] = [{ id: 'y_f', type: 'file', href: 'media:m_zip2.zip', label: 'Arena.zip', role: 'starter', shows: '' }];
  return parseCourse({ ...course, delivery: 'online-async', lessons: { ...course.lessons, [first!.id]: { ...first, page, facilitation: kit }, [second!.id]: { ...second, page: again } } });
}

describe('references to media kept on the device', () => {
  it('tells a reference from a path', () => {
    expect(localMediaRef('m_1.png')).toBe('media:m_1.png');
    expect(isLocalMedia('media:m_1.png')).toBe(true);
    expect(localMediaId('media:m_1.png')).toBe('m_1.png');
    for (const other of ['', 'media:', '/samples/unity/media/x.webp', 'https://example.com/a.png']) {
      expect(isLocalMedia(other)).toBe(false);
      expect(localMediaId(other)).toBeNull();
    }
  });

  it('lists every reference of a page once: pictures, step shots, a video and its poster, files', () => {
    expect(pageMediaRefs(page)).toEqual(['media:m_one.webp', 'media:m_two.png', 'media:m_clip.mp4', 'media:m_poster.webp', 'media:m_zip.zip', 'media:m_pdf.pdf']);
    expect(pageMediaRefs([...page, page[1]!])).toHaveLength(6);
  });

  it('knows a label that is a file name', () => {
    expect(isFileName('HopStart.zip ')).toBe(true);
    expect(isFileName('The starter project')).toBe(false);
  });
});

describe('the names media is exported under', () => {
  const names = mediaFileNames(online());

  it('says the week and the place on the page, from the caption', () => {
    expect(names.get('media:m_one.webp')).toBe('week-1-1-the-finished-arena-seen-from-above.webp');
    // The second picture is a path and gets no name, but keeps its number; the third is the shot under step 2.
    expect(names.get('media:m_two.png')).toBe('week-1-3-the-inspector.png');
    expect(names.get('media:m_clip.mp4')).toBe('week-1-5-rolling-the-ball.mp4');
    expect([...names.values()].every((n) => n.replace(/\.\w+$/, '').length <= 'week-1-1-'.length + 40)).toBe(true);
  });

  it('keeps a file label that is a name, and never gives two files one name', () => {
    expect(names.get('media:m_zip.zip')).toBe('Arena.zip');
    expect(names.get('media:m_zip2.zip')).toBe('Arena-2.zip');
    expect(names.get('media:m_pdf.pdf')).toBe('week-1-the-handout.pdf');
    expect(names.has('media:m_poster.webp')).toBe(false);
  });
});

describe('a module page with media, as a document', () => {
  const course = online();
  const first = orderedLessons(course)[0]!;
  const doc = project(course, 'plan', { audience: 'teacher', lessonIds: [first.id] });
  const text = JSON.stringify(doc);

  it('shows a video by its poster, and says which file it is', () => {
    expect(doc.blocks).toContainEqual({ t: 'image', src: 'media:m_poster.webp', alt: 'The Inspector', caption: 'Video, 4 min: Rolling the ball (file: media/week-1-5-rolling-the-ball.mp4)' });
    expect(doc.blocks).toContainEqual({ t: 'note', label: 'Transcript', text: 'First we roll.' });
  });

  it('names a file that goes out under another name than its label', () => {
    expect(text).toContain('File: The handout (file: media/week-1-the-handout.pdf)');
    expect(text).toContain('File: Arena.zip"');
  });

  it('counts what is on the device as made: only the empty places are still to make', () => {
    expect(text).toContain('To make before the week opens');
    expect(text).toContain('Picture (Build the arena, after step 3): The Inspector with Floor selected.');
    expect(text).toContain('File (Build the arena, after step 3): Later.zip: To come.');
    expect(text).not.toContain('Arena.zip: The project as it starts.');
    expect(text).not.toContain('after step 2)');
  });
});
