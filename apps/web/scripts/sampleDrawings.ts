import { cmd, type Course, type CourseStore } from '@folio/core';
import { withDrawings, type Drawer, type Inference, type Picture } from '@folio/ai';
import { pictureOf, type Drawn } from '@folio/draw';
import { drawInNode, fonts as drawFonts } from '@folio/draw/node';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Drawn slide pictures for the sample maker (make-samples.ts --draw): drawn in Node, painted by Chrome, read by the CLI. */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Drawn in Node; painted by Chrome, as the page paints it on a canvas, so the card is looked at once as it is in the app. */
export const nodeDrawer: Drawer = Object.assign(async (code: string) => drawInNode(code), {
  paint: async (drawn: Drawn): Promise<Picture | null> => {
    const dir = mkdtempSync(join(tmpdir(), 'folio-paint-'));
    writeFileSync(join(dir, 'p.svg'), pictureOf(drawn, drawFonts));
    await new Promise<void>((resolve) => spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--window-size=1040,840', `--screenshot=${join(dir, 'p.png')}`, `file://${join(dir, 'p.svg')}`], { stdio: 'ignore' }).on('close', () => resolve()));
    return existsSync(join(dir, 'p.png')) ? { type: 'image/png', data: readFileSync(join(dir, 'p.png')).toString('base64') } : null;
  },
});

/** The pictures in an Anthropic request, each saved in the CLI's empty folder: their paths. */
export function picturesIn(messages: { content: unknown }[], CWD: string): string[] {
  const blocks = messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type?: string; source?: { media_type?: string; data?: string } }[]) : []));
  return blocks.flatMap((b) => {
    if (b.type !== 'image' || !b.source?.data) return [];
    const file = join(CWD, `picture-${Math.random().toString(36).slice(2)}.${b.source.media_type === 'image/jpeg' ? 'jpg' : 'png'}`);
    writeFileSync(file, Buffer.from(b.source.data, 'base64'));
    return [file];
  });
}


/** Each deck's pictures drawn again from the slides as they stand, a picture first put back to the visual it replaced. */
export async function redrawCourse(inference: Inference, store: CourseStore, save: (course: Course) => void, lessons: number, said: (n: number) => void): Promise<void> {
  for (const id of store.getState().lessonOrder.slice(0, lessons)) {
    const lesson = store.getState().lessons[id]!;
    const slides = lesson.slides.map((s) => (s.visual?.kind === 'drawing' ? { ...s, visual: s.visual.from ? (JSON.parse(s.visual.from) as typeof s.visual) : undefined } : s));
    const fill = cmd('section.fill', { lessonId: id, kind: 'slides', flags: lesson.gen.slides?.flags ?? [], content: { slides } });
    store.apply(await withDrawings(inference, nodeDrawer, store.getState(), id, [fill]), { label: { key: 'built' }, source: 'ai', undoable: false });
    save(store.getState());
    said(store.getState().lessonOrder.indexOf(id) + 1);
  }
}
