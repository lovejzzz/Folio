import type { Course, Lesson, Rubric, Task } from '@folio/core';

/**
 * One lesson as the people who use it meet it: everything students are shown, material by material, and apart
 * from it what only the teacher sees. Each part of a lesson is written from the plan by a writer who sees none of
 * the others, and until this view nobody read them together.
 */

/** The materials a finding can name. A sheet and a page belong to the plan; a rubric and a key to the work they go with. */
export const MATERIALS = ['plan', 'handout', 'page', 'slides', 'study', 'faq', 'quiz', 'discussions', 'assignments'] as const;
export type MaterialName = (typeof MATERIALS)[number];

type Loose = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): Loose[] => (Array.isArray(v) ? (v as Loose[]) : []);
const table = (columns: unknown, rows: unknown): string => [list(columns).join(' | '), ...list(rows).map((r) => (r as unknown as string[]).join(' | '))].join('\n');

/** A block of a page, a sheet or an exhibit, as words. */
export function say(b: Loose): string {
  switch (b.type) {
    case 'heading':
      return `### ${str(b.text)}`;
    case 'list':
      return (b.items as string[]).map((i) => `- ${i}`).join('\n');
    case 'steps':
      return list(b.items).map((s, i) => `${i + 1}. ${str(s.text)}`).join('\n');
    case 'callout':
      return `[${str(b.kind)}${b.title ? `: ${str(b.title)}` : ''}] ${str(b.text)}`;
    case 'code':
      return `\`\`\`${str(b.language)}\n${str(b.code)}\n\`\`\``;
    case 'checklist':
      return list(b.items).map((i) => `- ${str(i.label)}${i.minutes ? ` (${String(i.minutes)} min)` : ''}${i.due ? `, due ${str(i.due)}` : ''}`).join('\n');
    case 'terms':
      return list(b.items).map((t) => `- ${str(t.term)}: ${str(t.meaning)}`).join('\n');
    case 'field':
      return `${str(b.label)}: ${str(b.value) || '________'}`;
    case 'table':
      return `${table(b.columns, b.rows)}${b.caption ? `\n(${str(b.caption)})` : ''}`;
    case 'yours':
      return `[room to answer${b.hint ? `: ${str(b.hint)}` : ''}]`;
    case 'exhibit':
      return [str(b.title), ...list(b.parts).flatMap((p) => [str(p.label), ...list(p.blocks).map(say)])].filter(Boolean).join('\n');
    case 'image':
    case 'video':
      return `[${b.type}: ${str(b.shows) || str(b.caption) || str(b.alt)}${b.minutes ? `, ${String(b.minutes)} min` : ''}]`;
    case 'file':
      return `[file: ${str(b.label)}]`;
    default:
      return str(b.text);
  }
}

/** A chart is drawn on the slide from its numbers: said so, or a reader takes it for a description of a picture nobody made. */
const chartText = (c: Extract<NonNullable<Lesson['slides'][number]['visual']>, { kind: 'chart' }>): string =>
  `[a ${c.chart} chart, drawn on the slide; along the bottom: ${c.categories.join(', ')}; ${c.series.map((x) => `${x.name || 'values'}: ${x.values.join(', ')}`).join('; ')}${c.unit ? ` (${c.unit})` : ''}]`;

const part = (name: string, body: string[]): string => (body.some((x) => x.trim()) ? `<${name}>\n${body.filter((x) => x.trim()).join('\n\n')}\n</${name}>` : '');
const letter = (i: number) => 'ABCDEFGH'[i] ?? '?';

function rubricText(r: Rubric | undefined): string {
  if (!r) return '';
  const level = (c: Rubric['criteria'][number]) => r.levels.map((lv) => `  ${lv.label} (${lv.points}): ${c.descriptors[lv.id] ?? ''}`).join('\n');
  return `Rubric:\n${r.criteria.map((c) => `- ${c.name}\n${level(c)}`).join('\n')}`;
}

function taskText(course: Course, t: Task, online: boolean, step = false): { students: string; teacher: string } {
  if (t.kind === 'question') {
    const key = t.choices.length ? letter(t.choices.findIndex((c) => c.id === t.correct)) : t.answer;
    const told = `Key to "${t.prompt.slice(0, 60)}": ${key}. Explanation${online ? ' (students see it after answering)' : ''}: ${t.explanation}`;
    return { students: [t.prompt, ...t.choices.map((c, i) => `  ${letter(i)}. ${c.text}`)].join('\n'), teacher: told };
  }
  if (t.kind === 'discussion') return { students: t.prompt, teacher: t.followUps.length ? `Follow-ups to "${t.prompt.slice(0, 60)}": ${t.followUps.join(' | ')}` : '' };
  const students = [`${t.title}${t.toward ? (step ? ` (an ungraded step toward ${t.toward})` : ` (counts toward ${t.toward})`) : ''}`, t.prompt, ...t.steps.map((s, i) => `${i + 1}. ${s}`), rubricText(t.rubricId ? course.rubrics[t.rubricId] : undefined)].filter(Boolean).join('\n');
  return { students, teacher: t.answerKey ? `Key and running notes for "${t.title}": ${t.answerKey}` : '' };
}

/**
 * The sheets a lesson hands out, for the writers that come after them. They are written straight after the plan,
 * and the slides, the guide and the graded work were then written without them: a slide told students to "write
 * four claims" that their sheet printed, and a graded "lab worksheet" was another thing than the worksheet of the lab.
 * And the sheet is the one source of its items: a slide showed six statements from the plan's notes beside a sheet of four.
 */
export function sheetsText(lesson: Lesson, whole: boolean): string {
  if (!lesson.handouts.length) return '';
  const sheet = (h: Lesson['handouts'][number]) => `"${h.title}" (${h.kind}, used in "${h.usedIn}")${whole ? `:\n${h.blocks.map((b) => say(b as Loose)).join('\n')}` : ''}`;
  return `The sheets students are handed in this lesson, already written${whole ? ' (what this material says of them agrees with them, and it asks for nothing they already hold; where it shows or works a sheet\'s items, they are the sheet\'s own, as many and in its words, whatever the plan says of them)' : ''}:\n${lesson.handouts.map(sheet).join(whole ? '\n\n' : '; ')}`;
}

/** The lesson in two parts, each tagged by material so a reader can say where a fault lies. */
export function lessonView(course: Course, lesson: Lesson): { students: string; teacher: string } {
  const online = lesson.page.length > 0;
  const tasks = lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Task => Boolean(t));
  const steps = new Set([lesson.homework, ...(lesson.also ?? [])].filter((p) => p.kind === 'step').map((p) => p.toward.trim()));
  const of = (kind: Task['kind']) => tasks.filter((t) => t.kind === kind).map((t) => taskText(course, t, online, t.kind === 'assignment' && steps.has(t.toward.trim())));
  const plan = lesson.segments.map((s, i) => `${i + 1}. ${s.title} (${s.kind}, ${s.minutes} min): ${s.description}${s.teacherNotes ? `\n   Teacher's notes: ${s.teacherNotes}` : ''}`);
  const slide = (s: Lesson['slides'][number], i: number) => [`Slide ${i + 1}: ${s.title}`, ...s.bullets.map((b) => `- ${b}`), s.visual?.kind === 'table' ? table(s.visual.columns, s.visual.rows) : s.visual ? chartText(s.visual) : ''].filter(Boolean).join('\n');
  const faq = lesson.faqIds.map((id) => course.faq[id]).filter(Boolean);
  const students = [
    part('page', lesson.page.map((b) => say(b as Loose))),
    part('slides', lesson.slides.map(slide)),
    ...lesson.handouts.map((h) => part('handout', [`${h.title} (${h.kind}; ${h.copies}; used in "${h.usedIn}")`, ...h.blocks.map((b) => say(b as Loose))])),
    part('study', [lesson.study.overview, ...lesson.study.points.map((p) => `${p.heading}: ${p.explanation}`)]),
    part('faq', faq.map((f) => `Q: ${f!.question}\nA: ${f!.answer}`)),
    part('quiz', of('question').map((t) => t.students)),
    part('discussions', of('discussion').map((t) => t.students)),
    part('assignments', of('assignment').map((t) => t.students)),
  ];
  const teacher = [
    part('plan', [...plan, lesson.keyIdeas.length ? `Key ideas: ${lesson.keyIdeas.join(' | ')}` : '']),
    part('slides', lesson.slides.map((s, i) => (s.notes ? `Speaker notes, slide ${i + 1}: ${s.notes}` : ''))),
    part('handout', lesson.handouts.map((h) => (h.key ? `Key to "${h.title}": ${h.key}` : ''))),
    part('quiz', of('question').map((t) => t.teacher)),
    part('discussions', of('discussion').map((t) => t.teacher)),
    part('assignments', of('assignment').map((t) => t.teacher)),
  ];
  return { students: students.filter(Boolean).join('\n\n'), teacher: teacher.filter(Boolean).join('\n\n') };
}
