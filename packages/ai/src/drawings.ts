import { type Command, type Course, type Lesson, type Slide, type SlideVisual } from '@folio/core';
import { DRAW_RULES, LOOK_RULES, PICK_RULES, drawingFaults, exampleCard, typeIds, type DrawResult, type Drawn, type SlideWords } from '@folio/draw';
import { z } from 'zod';
import { seesPictures, type Inference, type Picture } from './inference';
import { runJob } from './jobs';
import { systemPrompt } from './prompts';

/**
 * Slides drawn as pictures (packages/draw, after April Zhu's Minicharts). Two calls: one picks the slides of a
 * lesson worth drawing and how, one draws each as a card's code. The code is drawn wherever the caller can run it
 * (the page's drawing frame, or Node on the command line), and what it drew is checked. A card with faults goes
 * back to its writer once with them; one that still has faults is not shown, and the slide keeps what it had.
 *
 * Off unless the teacher turns it on: each picture is one more request, paid like any other.
 */

/**
 * Runs a card's code and says what it drew. Where it can also paint what was drawn (a canvas on the page, Chrome on
 * the command line), `paint` gives the picture, and the card is looked at once before it is kept.
 */
export type Drawer = ((code: string) => Promise<DrawResult>) & { paint?: (drawn: Drawn) => Promise<Picture | null> };

type Drawing = Extract<SlideVisual, { kind: 'drawing' }>;

/** The most slides of a lesson drawn while it is written. */
export const DRAWINGS_PER_LESSON = 2;

const CHOICE = /^\s*\(?([A-Fa-f])[.)]\s+(.+)$/;

/** What a slide's visual holds, as JSON: the visual itself, or the one a picture took the place of. A demonstration is Folio's own and is not drawn. */
const visualJson = (slide: Slide): string => (!slide.visual || slide.visual.kind === 'figure' ? '' : slide.visual.kind === 'drawing' ? slide.visual.from : JSON.stringify(slide.visual));

/** What a slide says, as the checks read it: its words, and the choices of a question it asks. */
export function slideWords(slide: Slide): SlideWords {
  const choices = slide.bullets.flatMap((b) => {
    const m = b.match(CHOICE);
    return m ? [m[2]!] : [];
  });
  return { text: [slide.title, ...slide.bullets, visualJson(slide)].join('\n'), choices: slide.layout === 'question' || choices.length >= 2 ? choices : [] };
}

/** A line that sets students a task: work it out, list it, mark it. */
const TASK = /^\s*(?:\(?[a-f]?[.)]?\s*)?(?:list|mark|name|predict|label|explain|compare|identify|find|work out|calculate|estimate|decide|rank|sort|classify|say|write|copy|sketch|draw|match|choose|pick|order)\b/i;

/**
 * A slide that asks students anything: a question, choices, or a task to work out. Such a slide is not picked to be
 * drawn as a lesson is written: a picture of what it gives does the working for the students. Of 23 drawings in a
 * geology course, three answered their slide: the eons drawn to scale beside "mark which eon lasted longest", the
 * routes of the rock cycle beside "list the routes". Drawn when a teacher asks, its notes, which hold the answer, are
 * not shown.
 */
const asks = (slide: Slide): boolean =>
  slide.layout === 'question' || slideWords(slide).choices.length >= 2 || [slide.title, ...slide.bullets].some((t) => t.includes('?') || TASK.test(t));

function slideText(slide: Slide, n: number): string {
  const visual = visualJson(slide) ? `\n  On the slide: ${visualJson(slide).slice(0, 1500)}` : '';
  const notes = asks(slide) ? '\n  (The slide asks students this: draw what it gives, never its answer.)' : slide.notes ? `\n  Teacher's notes: ${slide.notes.slice(0, 800)}` : '';
  return `${n}. ${slide.title} [${slide.layout}]\n  ${slide.bullets.join('\n  ')}${visual}${notes}`;
}

const who = (course: Course): string => `The students: ${course.audience.level || 'not said'}, in ${course.audience.subject || course.title}. The course: ${course.title}.`;

const Pick = z.object({
  slides: z.array(z.object({ slide: z.number().int().min(1), type: z.string(), object: z.string() })).max(4),
});
export type Pick = z.infer<typeof Pick>['slides'][number];

/** The slides of a lesson worth drawing, at most `max`, each with its chart type and object. */
export async function pickDrawings(inference: Inference, course: Course, lesson: Lesson, max: number, signal?: AbortSignal, only?: { slide: number; hint: string }): Promise<Pick[]> {
  const { TYPES } = await import('@folio/draw/kit');
  const known = new Set(typeIds(TYPES));
  const slides = only ? [{ s: lesson.slides[only.slide - 1]!, n: only.slide }] : lesson.slides.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.visual?.kind !== 'drawing' && s.visual?.kind !== 'figure' && !asks(s));
  if (!slides.length) return [];
  const ask = only
    ? `Choose how to draw slide ${only.slide}${only.hint ? `. The teacher asks: "${only.hint}"` : ''}. Answer with that one slide, or none if it cannot be drawn from its own words.`
    : `Pick at most ${max} slides.`;
  const prompt = `${PICK_RULES}\n\n${who(course)}\n\n<types>\n${TYPES}\n</types>\n\n<slides>\n${slides.map(({ s, n }) => slideText(s, n)).join('\n\n')}\n</slides>\n\n${ask}`;
  const { value } = await runJob(inference, { task: 'folio_draw_pick', system: systemPrompt(course.language, course.locale), prompt, effort: 'low', schema: Pick, repair: false, signal });
  const seen = new Set<number>();
  return value.slides.filter((p) => known.has(p.type) && lesson.slides[p.slide - 1] && !seen.has(p.slide) && seen.add(p.slide)).slice(0, only ? 1 : max);
}

const Card = z.object({ type: z.string(), object: z.string(), code: z.string().min(40).max(40_000) });

async function writeCard(inference: Inference, course: Course, slide: Slide, n: number, pick: Pick, signal: AbortSignal | undefined, fix?: { code: string; faults: string[] }): Promise<z.infer<typeof Card>> {
  const kit = await import('@folio/draw/kit');
  const context = `${DRAW_RULES}\n\n<kit>\n${kit.KIT}\n</kit>\n\n<types>\n${kit.TYPES}\n</types>`;
  const again = fix ? `\n\nYour card drew with these faults. Fix them and answer with the whole card again:\n- ${fix.faults.join('\n- ')}\n\n<your_card>\n${fix.code}\n</your_card>` : '';
  const prompt = `${who(course)}\n\nDraw this slide as a ${pick.type} card, drawn as ${pick.object}.\n\n<slide>\n${slideText(slide, n)}\n</slide>\n\n<example_card type="${pick.type}">\n${exampleCard(kit.EXAMPLES, pick.type)}\n</example_card>${again}`;
  const { value } = await runJob(inference, { task: 'folio_draw_card', system: systemPrompt(course.language, course.locale), context, prompt, effort: 'medium', schema: Card, repair: false, signal });
  return value;
}

/** A drawn card's faults: why it could not run, or what the checks found in it. */
async function tryCard(draw: Drawer, code: string, slide: Slide): Promise<{ faults: string[]; drawn?: Drawn }> {
  const r = await draw(code);
  if (!r.ok) return { faults: [`The code did not run: ${r.error}`] };
  if (r.drawn.length !== 1) return { faults: [`The code drew ${r.drawn.length} cards: draw exactly one.`] };
  return { faults: drawingFaults(r.drawn[0]!, slideWords(slide)), drawn: r.drawn[0]! };
}

const Look = z.object({ ok: z.boolean(), faults: z.array(z.string()).max(12).default([]), code: z.string().max(40_000).default('') });

/**
 * The drawn card looked at as a student would see it, once: right as it is, or its faults and the whole card mended
 * in the same answer. The checks read the drawing's text; only a look sees that a label sits on a mark, that a prop
 * hides the chart, or that the picture shows something beside the slide's point. In the first two sample courses
 * drawn without it, a monopoly slide about marginal revenue was drawn as falling prices alone.
 */
async function lookAt(inference: Inference, course: Course, slide: Slide, n: number, code: string, picture: Picture, signal: AbortSignal | undefined): Promise<z.infer<typeof Look>> {
  const kit = await import('@folio/draw/kit');
  const context = `${DRAW_RULES}\n\n<kit>\n${kit.KIT}\n</kit>\n\n<types>\n${kit.TYPES}\n</types>`;
  const prompt = `${who(course)}\n\n<slide>\n${slideText(slide, n)}\n</slide>\n\n<card>\n${code}\n</card>\n\n${LOOK_RULES}`;
  const { value } = await runJob(inference, { task: 'folio_draw_look', system: systemPrompt(course.language, course.locale), context, prompt, effort: 'medium', schema: Look, images: [picture], repair: false, signal });
  return value;
}

/** Written, checked and mended once; then, where it can be painted, looked at and mended once more. Null where it could not be drawn clean. */
async function cardFor(inference: Inference, draw: Drawer, course: Course, slide: Slide, n: number, pick: Pick, signal?: AbortSignal): Promise<{ code: string; type: string; drawn: Drawn } | null> {
  let card = await writeCard(inference, course, slide, n, pick, signal);
  let tried = await tryCard(draw, card.code, slide);
  if (tried.faults.length) {
    card = await writeCard(inference, course, slide, n, pick, signal, { code: card.code, faults: tried.faults });
    tried = await tryCard(draw, card.code, slide);
  }
  if (tried.faults.length || !tried.drawn) return null;
  const picture = draw.paint && seesPictures(inference.provider) ? await draw.paint(tried.drawn).catch(() => null) : null;
  if (!picture) return { code: card.code, type: card.type || pick.type, drawn: tried.drawn };
  const look = await lookAt(inference, course, slide, n, card.code, picture, signal).catch(() => null);
  if (!look || look.ok || !look.code.trim()) return { code: card.code, type: card.type || pick.type, drawn: tried.drawn };
  // The mended card stands only if it still passes every check; otherwise the card as first drawn is kept.
  const mended = await tryCard(draw, look.code, slide);
  return mended.faults.length || !mended.drawn ? { code: card.code, type: card.type || pick.type, drawn: tried.drawn } : { code: look.code, type: card.type || pick.type, drawn: mended.drawn };
}

/** One slide drawn as `pick` says: the visual, or null where it could not be drawn clean. */
export async function drawSlide(inference: Inference, draw: Drawer, course: Course, lesson: Lesson, pick: Pick, signal?: AbortSignal): Promise<Drawing | null> {
  const slide = lesson.slides[pick.slide - 1];
  if (!slide) return null;
  const card = await cardFor(inference, draw, course, slide, pick.slide, pick, signal);
  if (!card) return null;
  return { kind: 'drawing', code: card.code, type: card.type, of: card.drawn.of, note: card.drawn.note, parts: card.drawn.parts.slice(0, 60), from: visualJson(slide) };
}

/**
 * A lesson's slides drawn while it is written: up to `max` picked from the deck about to be put in, each drawn and
 * checked. Returns the commands with the pictures on their slides. A drawing that fails leaves its slide as it was,
 * and a call that fails is let go: a deck is complete without its pictures, and is never held back for one.
 */
export async function withDrawings(inference: Inference, draw: Drawer, course: Course, lessonId: string, commands: Command[], signal?: AbortSignal, max = DRAWINGS_PER_LESSON): Promise<Command[]> {
  const at = commands.findIndex((c) => c.type === 'section.fill' && c.payload.kind === 'slides');
  const fill = commands[at];
  const lesson = course.lessons[lessonId];
  if (!fill || fill.type !== 'section.fill' || fill.payload.kind !== 'slides' || !lesson) return commands;
  const deck = { ...lesson, slides: fill.payload.content.slides };
  const picks = await pickDrawings(inference, course, deck, max, signal).catch(() => []);
  const drawn = await Promise.all(picks.map((p) => drawSlide(inference, draw, course, deck, p, signal).catch(() => null)));
  const byId = new Map(picks.flatMap((p, i) => (drawn[i] ? [[deck.slides[p.slide - 1]!.id, drawn[i]!] as const] : [])));
  if (!byId.size) return commands;
  const slides = deck.slides.map((s) => (byId.has(s.id) ? { ...s, visual: byId.get(s.id)! } : s));
  return commands.map((c, i) => (i === at && c.type === 'section.fill' && c.payload.kind === 'slides' ? { ...c, payload: { ...c.payload, content: { ...c.payload.content, slides } } } : c));
}
