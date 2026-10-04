import { pageText, type Course, type Lesson, type PageBlock } from '@folio/core';
import { z } from 'zod';
import type { Inference, Picture } from './inference';
import { runJob } from './jobs';
import { systemPrompt } from './prompts';

/**
 * A picture a teacher made for a step, looked at beside the step. A reader of the page's words cannot see its
 * pictures: in one course a text review passed nine pictures that were blank, of another window, or of a later
 * step's state, and students check their own screen against exactly these.
 */

const line = z.string().min(1);

export const PictureCheck = z.object({
  shows: line.describe('What the picture shows, in one sentence: which window, in what state'),
  problems: z.array(line).max(6).default([]).describe('Each way the picture disagrees with the page at this point, quoting what the picture shows and what the page says; empty when it fits'),
  personal: z
    .array(line)
    .max(6)
    .default([])
    .describe('Personal details readable in the picture that a teacher may not mean to publish: a person\'s or an account\'s name, an email address, a folder path with a user name in it, a license or key. Each as it reads; empty when there are none'),
});
export type PictureCheck = z.infer<typeof PictureCheck>;

/** A picture's place on the page: the part it is in, the page's words up to it, and what it was asked to show. */
export interface PicturePlace {
  part: string;
  before: string;
  shows: string;
  caption: string;
}

/** How much of the page before the picture is shown with it: the steps that lead to it, not the whole week. */
const BEFORE = 2400;

/** Where a picture sits, by its block's id or, for a picture under a step, the step's. Null when the page has no such picture. */
export function picturePlace(page: readonly PageBlock[], id: string): PicturePlace | null {
  let part = '';
  let start = 0;
  for (const [i, block] of page.entries()) {
    if (block.type === 'heading' && block.level === 2) [part, start] = [block.text, i + 1];
    const step = block.type === 'steps' ? block.items.findIndex((s) => s.id === id && s.shot) : -1;
    if (step >= 0 && block.type === 'steps') {
      const shot = block.items[step]!.shot!;
      const before = pageText([...page.slice(start, i), { ...block, items: block.items.slice(0, step + 1).map((s) => ({ id: s.id, text: s.text })) }]);
      return { part, before: before.slice(-BEFORE), shows: shot.shows, caption: shot.caption };
    }
    if (block.id === id && (block.type === 'image' || block.type === 'video')) return { part, before: pageText(page.slice(start, i)).slice(-BEFORE), shows: block.shows, caption: block.caption };
  }
  return null;
}

export function pictureCheckPrompt(course: Course, lesson: Lesson, place: PicturePlace): string {
  return [
    `A teacher made this picture for a week's page of the course "${course.title}", the week "${lesson.title}". Students follow the page alone and check their own screen against the picture.`,
    place.part ? `It is in the part "${place.part}".` : '',
    place.before.trim() ? `The page up to the picture:\n${place.before.trim()}` : '',
    place.shows.trim() ? `It was asked to show: ${place.shows.trim()}` : '',
    place.caption.trim() ? `Its caption tells students: ${place.caption.trim()}` : '',
    [
      'Look at the picture and compare it with the page at this point.',
      'It fits when it is the window and the state the page has reached: the names, values and text that can be read in it agree with the page\'s, what the caption tells students to compare can be seen, and nothing is in it that only a later step would add.',
      'Under "problems", list each disagreement, quoting what the picture shows and what the page says ("the picture shows Position 0, 1, 0; the step sets 0, 0.5, 0"). A picture that is blank, of another window, or too small to read what must be read is a problem.',
      'Do not list its crop, size, colors or theme unless they hide what must be seen, nor anything the page says nothing about.',
      'Under "personal", list what is readable in the picture that names a person or an account.',
    ].join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Look at one picture beside its step. */
export async function checkPicture(inference: Inference, course: Course, lesson: Lesson, place: PicturePlace, picture: Picture, signal?: AbortSignal): Promise<PictureCheck> {
  const result = await runJob(inference, { task: 'folio_picture_check', system: systemPrompt(course.language, course.locale), prompt: pictureCheckPrompt(course, lesson, place), effort: 'low', schema: PictureCheck, images: [picture], repair: false, signal });
  return result.value;
}
