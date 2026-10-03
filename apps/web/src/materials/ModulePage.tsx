import { cmd, statedObjectives, type Course, type Facilitation, type Lesson, type PageBlock } from '@folio/core';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { EditableList } from './EditableList';
import { Callout, Checklist, CodeBlock, FileRow, Media, Steps, Terms, type Patch } from './ModuleBlocks';
import { useSectionEdit } from './useSectionEdit';

interface Part {
  heading: Extract<PageBlock, { type: 'heading' }> | null;
  blocks: PageBlock[];
}

/** The page in parts: what comes before the first part's title, then each part under its title. */
function partsOf(page: PageBlock[]): Part[] {
  const parts: Part[] = [{ heading: null, blocks: [] }];
  for (const block of page) {
    if (block.type === 'heading' && block.level === 2) parts.push({ heading: block, blocks: [] });
    else parts.at(-1)!.blocks.push(block);
  }
  return parts;
}

/** One block, drawn as its kind; `step` is the number its first step takes. */
function Block({ block, step, patch, lead }: { block: PageBlock; step: number; patch: Patch; lead: boolean }) {
  const t = useT();
  switch (block.type) {
    case 'heading':
      return <EditableText as="h4" className="mod-h3" value={block.text} label={t.module.heading} onCommit={(text) => patch({ ...block, text })} />;
    case 'text':
      return <EditableText as="p" multiline className={lead ? 'mod-lead' : undefined} value={block.text} label={t.module.blockText} onCommit={(text) => patch({ ...block, text })} />;
    case 'list':
      return (
        <ul className="mod-list">
          {block.items.map((item, i) => (
            <EditableText key={i} as="li" multiline value={item} label={t.module.blockText} onCommit={(text) => patch({ ...block, items: block.items.map((x, n) => (n === i ? text : x)) })} />
          ))}
        </ul>
      );
    case 'steps':
      return <Steps block={block} start={step} patch={patch} />;
    case 'callout':
      return <Callout block={block} patch={patch} />;
    case 'code':
      return <CodeBlock block={block} />;
    case 'image':
      return <Media kind="image" {...block} />;
    case 'video':
      return <Media kind="video" {...block} />;
    case 'file':
      return <FileRow block={block} />;
    case 'checklist':
      return <Checklist block={block} />;
    case 'terms':
      return <Terms block={block} />;
  }
}

function PartView({ part, n, patch }: { part: Part; n: number; patch: Patch }) {
  const t = useT();
  // Steps are numbered through the part, across the pictures and notes between them.
  const before = (i: number) => part.blocks.slice(0, i).reduce((n, b) => n + (b.type === 'steps' ? b.items.length : 0), 0);
  const body = part.blocks.map((block, i) => <Block key={block.id} block={block} step={before(i) + 1} patch={patch} lead={!part.heading && block.type === 'text'} />);
  if (!part.heading) return <>{body}</>;
  const heading = part.heading;
  return (
    <section className="mod-part" aria-label={`${t.module.part(n)}: ${heading.text}`}>
      <header>
        <p className="mod-kicker">{t.module.part(n)}</p>
        <EditableText as="h3" className="mod-part-title" value={heading.text} label={t.module.heading} required onCommit={(text) => patch({ ...heading, text })} />
      </header>
      {body}
    </section>
  );
}

/** The instructor's kit for the week. It is on the teacher's page only: no student copy carries it. */
function Kit({ course, lesson, kit }: { course: Course; lesson: Lesson; kit: Facilitation }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  const set = (next: Partial<Facilitation>) => save([cmd('plan.update', { lessonId: lesson.id, facilitation: { ...kit, ...next } })]);
  return (
    <aside className="mod-kit no-print" aria-labelledby={`kit-${lesson.id}`}>
      <div>
        <p id={`kit-${lesson.id}`} className="mod-kicker">
          {t.module.kit}
        </p>
        <p className="text-ink-2">{t.module.kitNote}</p>
      </div>
      <div>
        <h4>{t.module.announcement}</h4>
        <EditableText as="p" multiline value={kit.announcement} label={t.module.announcement} onCommit={(announcement) => set({ announcement })} />
      </div>
      <div>
        <h4>{t.module.watchFor}</h4>
        <EditableList items={kit.watchFor} label={t.module.watchFor} addLabel={t.module.addNote} placeholder="…" lang={course.language} context={lesson.title} onChange={(watchFor) => set({ watchFor })} />
      </div>
      <div>
        <h4>{t.module.feedback}</h4>
        <EditableList items={kit.feedback} label={t.module.feedback} addLabel={t.module.addNote} placeholder="…" lang={course.language} context={lesson.title} onChange={(feedback) => set({ feedback })} />
      </div>
      {kit.atRisk && (
        <div>
          <h4>{t.module.atRisk}</h4>
          <EditableText as="p" multiline value={kit.atRisk} label={t.module.atRisk} onCommit={(atRisk) => set({ atRisk })} />
        </div>
      )}
    </aside>
  );
}

/** A week of an online course, as the student reads it, with the instructor's kit after it. */
export function ModulePage({ course, lesson }: { course: Course; lesson: Lesson }) {
  const save = useSectionEdit(course, lesson.id, 'plan');
  const patch: Patch = (block) => save([cmd('plan.update', { lessonId: lesson.id, page: lesson.page.map((b) => (b.id === block.id ? block : b)) })]);
  const t = useT();
  const parts = partsOf(lesson.page);
  const objectives = statedObjectives(course, lesson);
  return (
    <div className="mod" lang={course.language}>
      {objectives.length > 0 && (
        <section className="mod-objectives" aria-label={t.module.objectives}>
          <p className="mod-kicker">{t.module.objectives}</p>
          <ul>
            {objectives.map((o) => (
              <li key={o.id}>{o.text}</li>
            ))}
          </ul>
        </section>
      )}
      {parts.map((part, i) => (
        <PartView key={part.heading?.id ?? 'lead'} part={part} n={i} patch={patch} />
      ))}
      {lesson.facilitation && <Kit course={course} lesson={lesson} kit={lesson.facilitation} />}
    </div>
  );
}
