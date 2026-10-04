import { orderedLessons, type Course, type Lesson } from '@folio/core';

/** How much earlier code a page is shown: the files written last, whole, until this is used up. */
const FILES_BUDGET = 16000;

/** A code block whose caption is a file's name holds that file ("Assets/Scripts/Patrol.cs"), not lines added inside one. */
const FILE_NAME = /^[\w./-]+\.\w{1,6}$/;
/** Lines added to a file a block before wrote: "New fields in GameManager.cs", "End of BallController.cs". */
const PART_OF = /\b(?:in|of|to)\s+([\w./-]+\.\w{1,6})$/;

interface Written {
  code: string;
  week: number;
  /** Lines put into the file after it was last written whole, in order. */
  since: { caption: string; code: string; week: number }[];
}

const base = (name: string) => name.split('/').pop()!;

/** Each file the earlier weeks wrote: its last whole version, and what was added to it afterwards. */
function written(course: Course, lesson: Lesson): Map<string, Written> {
  const files = new Map<string, Written>();
  orderedLessons(course)
    .slice(0, Math.max(0, course.lessonOrder.indexOf(lesson.id)))
    .forEach((l, i) => {
      for (const b of l.page ?? []) {
        if (b.type !== 'code') continue;
        const caption = b.caption.trim();
        if (FILE_NAME.test(caption)) files.set(base(caption), { code: b.code.trim(), week: i + 1, since: [] });
        else files.get(base(PART_OF.exec(caption)?.[1] ?? ''))?.since.push({ caption, code: b.code.trim(), week: i + 1 });
      }
    });
  return files;
}

/**
 * The files the student's work holds, as earlier weeks last wrote them. A week was told only what the week before
 * "leaves", in the writer's own words: a field named `speed` under Patrol came back as "Patrol Speed", and a game
 * moved with A, W, S and D was given a hint about the arrow keys. The code itself cannot be paraphrased.
 */
export function filesSoFar(course: Course, lesson: Lesson): string {
  const files = [...written(course, lesson)].sort((a, b) => Math.max(b[1].week, ...b[1].since.map((s) => s.week)) - Math.max(a[1].week, ...a[1].since.map((s) => s.week)));
  if (!files.length) return '';
  const whole: string[] = [];
  const named: string[] = [];
  let used = 0;
  for (const [name, file] of files) {
    // What later weeks put into a file is part of it: shown only the whole version, a week wrote it again without them.
    const added = file.since.map((s) => `Then week ${s.week} put in ("${s.caption}"):\n${s.code}`);
    const text = [`${name}, as week ${file.week} wrote it:\n${file.code}`, ...added].join('\n');
    if (used + text.length > FILES_BUDGET) named.push(`${name} (week ${file.week})`);
    else {
      whole.push(text);
      used += text.length;
    }
  }
  return [
    'Files the student\'s work already holds, as an earlier week last wrote them. Use their names exactly: what a setting is called on screen follows from its name in this code and nothing is added to it, the keys the student presses are the keys this code reads, and a file written again still does what it does here.',
    ...whole,
    named.length ? `Written earlier too: ${named.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
