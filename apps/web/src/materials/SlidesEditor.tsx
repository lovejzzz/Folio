import { cmd, newId, orderedLessons, type Course, type Lesson, type Slide, type SlideLayout } from '@folio/core';
import { IconButton, SegmentedControl, cx } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { edit } from '../state/edit';
import { SlideCanvas } from './SlideCanvas';

/** In the lesson view: the deck as a grid of thumbnails that open the slide editor. */
export function SlidesStrip({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {lesson.slides.map((s, i) => (
        <li key={s.id}>
          <Link
            to="/c/$courseId/m/$kind"
            params={{ courseId: course.id, kind: 'slides' }}
            search={{ lesson: lesson.id }}
            aria-label={`${t.lesson.slideOf(i + 1, lesson.slides.length)}: ${s.title}`}
            className="block overflow-hidden rounded-control shadow-sheet outline-none transition-shadow duration-200 hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SlideCanvas slide={s} lang={course.language} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

interface Pos {
  lessonId: string;
  slideId: string;
}

function Filmstrip({ course, lessons, pos, onSelect }: { course: Course; lessons: Lesson[]; pos: Pos | null; onSelect: (p: Pos) => void }) {
  const t = useT();
  return (
    <nav aria-label={t.lesson.filmstrip} className="no-print hidden w-44 shrink-0 space-y-5 lg:block">
      {lessons.map((lesson, li) => (
        <div key={lesson.id}>
          <p className="mb-2 truncate font-ui text-12 font-medium text-ink-2" lang={course.language}>
            {t.common.lesson(li + 1)} · {lesson.title}
          </p>
          <ol className="space-y-2">
            {lesson.slides.map((s, i) => {
              const active = pos?.slideId === s.id;
              return (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="w-4 pt-1 text-right font-mono text-12 text-ink-3 tabular">{i + 1}</span>
                  <button
                    type="button"
                    aria-current={active || undefined}
                    aria-label={`${t.lesson.slideOf(i + 1, lesson.slides.length)}: ${s.title}`}
                    onClick={() => onSelect({ lessonId: lesson.id, slideId: s.id })}
                    className={cx('block flex-1 overflow-hidden rounded-control shadow-sheet outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent', active && 'ring-2 ring-accent')}
                  >
                    <SlideCanvas slide={s} lang={course.language} />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}

function StageTools({ lesson, slide, index, save }: { lesson: Lesson; slide: Slide; index: number; save: (slides: Slide[]) => void }) {
  const t = useT();
  const slides = lesson.slides;
  const move = (to: number) => {
    const next = [...slides];
    next.splice(index, 1);
    next.splice(to, 0, slide);
    save(next);
  };
  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
      <SegmentedControl<SlideLayout>
        label={t.lesson.layout}
        value={slide.layout}
        onChange={(layout) => save(slides.map((s) => (s.id === slide.id ? { ...s, layout } : s)))}
        options={(['title', 'bullets', 'question', 'quote'] as const).map((id) => ({ id, label: t.lesson.layouts[id] }))}
      />
      <div className="flex items-center gap-1">
        <IconButton label={t.lesson.moveSlideUp} isDisabled={index === 0} onPress={() => move(index - 1)}>
          <ArrowUp size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.lesson.moveSlideDown} isDisabled={index === slides.length - 1} onPress={() => move(index + 1)}>
          <ArrowDown size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.lesson.addSlide} onPress={() => save([...slides.slice(0, index + 1), { id: newId('x'), layout: 'bullets', title: t.lesson.slideTitle, bullets: [], notes: '' }, ...slides.slice(index + 1)])}>
          <Plus size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.lesson.removeSlide} isDisabled={slides.length <= 1} onPress={() => save(slides.filter((s) => s.id !== slide.id))}>
          <Trash2 size={16} strokeWidth={1.5} />
        </IconButton>
      </div>
    </div>
  );
}

/** The slide editor: filmstrip, 16:9 stage and speaker notes. Layouts, not a free-form canvas. */
export function SlidesEditor({ course, focusLesson }: { course: Course; focusLesson?: string }) {
  const t = useT();
  const lessons = orderedLessons(course).filter((l) => l.slides.length > 0);
  const initial = lessons.find((l) => l.id === focusLesson) ?? lessons[0];
  const [pos, setPos] = useState<Pos | null>(initial?.slides[0] ? { lessonId: initial.id, slideId: initial.slides[0].id } : null);
  const lesson = (pos && course.lessons[pos.lessonId]) || initial;
  if (!lesson) return null;
  const index = Math.max(0, lesson.slides.findIndex((s) => s.id === pos?.slideId));
  const slide = lesson.slides[index];
  if (!slide) return null;
  const n = course.lessonOrder.indexOf(lesson.id) + 1;
  const save = (slides: Slide[]) => edit([cmd('slides.update', { lessonId: lesson.id, slides })], { key: 'editedMaterial', values: { material: t.materialOne.slides, n } });
  const update = (next: Slide) => save(lesson.slides.map((s) => (s.id === next.id ? next : s)));
  return (
    <div className="flex items-start gap-8">
      <Filmstrip course={course} lessons={lessons} pos={pos} onSelect={setPos} />
      <div className="mx-auto min-w-0 max-w-slide flex-1">
        <StageTools lesson={lesson} slide={slide} index={index} save={save} />
        <div className="overflow-hidden rounded-sheet shadow-overlay">
          <SlideCanvas key={slide.id} slide={slide} lang={course.language} footer={`${t.common.lesson(n)} · ${lesson.title}`} onChange={update} />
        </div>
        <p className="mt-2 text-right font-ui text-12 text-ink-2 tabular">{t.lesson.slideOf(index + 1, lesson.slides.length)}</p>
        <section className="mt-4 rounded-sheet bg-paper p-5 shadow-sheet">
          <h3 className="mb-2 flex items-center gap-1.5 font-ui text-13 font-semibold text-ink">
            {t.lesson.speakerNotes}
            <span className="flex items-center gap-1 font-normal text-ink-2">
              · <EyeOff size={12} strokeWidth={1.75} aria-hidden /> {t.quiz.teacherOnly}
            </span>
          </h3>
          <EditableText key={slide.id} as="p" multiline value={slide.notes} label={t.lesson.speakerNotes} placeholder="…" lang={course.language} className="block font-reading text-16 leading-7 text-ink-2" onCommit={(notes) => update({ ...slide, notes })} />
        </section>
      </div>
    </div>
  );
}
