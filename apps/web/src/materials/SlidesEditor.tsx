import { cmd, newId, orderedLessons, type Course, type Lesson, type Slide, type SlideLayout } from '@folio/core';
import { IconButton, SegmentedControl } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, EyeOff, Plus, Trash2 } from 'lucide-react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { edit } from '../state/edit';
import { SlideCanvas } from './SlideCanvas';
import { Filmstrip, SlidePager, deckOrder, useArrowKeys, type SlidePos } from './SlideNav';

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
            search={{ lesson: lesson.id, slide: i + 1 }}
            aria-label={t.common.labelled(t.lesson.slideOf(i + 1, lesson.slides.length), s.title)}
            className="block overflow-hidden rounded-control shadow-sheet outline-none transition-shadow duration-200 hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SlideCanvas slide={s} lang={course.language} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

interface StageToolsProps {
  lesson: Lesson;
  slide: Slide;
  index: number;
  save: (slides: Slide[]) => void;
  /** Show another slide of this lesson, so the selection follows a moved, added or removed slide. */
  go: (index: number) => void;
}

function StageTools({ lesson, slide, index, save, go }: StageToolsProps) {
  const t = useT();
  const slides = lesson.slides;
  const move = (to: number) => {
    const next = [...slides];
    next.splice(index, 1);
    next.splice(to, 0, slide);
    save(next);
    go(to);
  };
  const add = () => {
    save([...slides.slice(0, index + 1), { id: newId('x'), layout: 'bullets', title: t.lesson.slideTitle, bullets: [], notes: '' }, ...slides.slice(index + 1)]);
    go(index + 1);
  };
  const remove = () => {
    save(slides.filter((s) => s.id !== slide.id));
    go(Math.min(index, slides.length - 2));
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
        <IconButton label={t.lesson.addSlide} onPress={add}>
          <Plus size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.lesson.removeSlide} isDisabled={slides.length <= 1} onPress={remove}>
          <Trash2 size={16} strokeWidth={1.5} />
        </IconButton>
      </div>
    </div>
  );
}

/** The lesson and slide to show: the one asked for, clamped to what exists, else the first. */
function resolve(lessons: Lesson[], lessonId: string | undefined, slide: number | undefined): SlidePos | null {
  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  if (!lesson) return null;
  return { lessonId: lesson.id, index: Math.min(lesson.slides.length - 1, Math.max(0, (slide ?? 1) - 1)) };
}

interface SlidesEditorProps {
  course: Course;
  /** The lesson to open, and the slide within it counted from 1: both come from the URL. */
  lessonId?: string;
  slide?: number;
  onGo: (pos: SlidePos) => void;
}

/** The slide editor: filmstrip, 16:9 stage and speaker notes. Layouts, not a free-form canvas. */
export function SlidesEditor({ course, lessonId, slide: slideNumber, onGo }: SlidesEditorProps) {
  const t = useT();
  const lessons = orderedLessons(course).filter((l) => l.slides.length > 0);
  const pos = resolve(lessons, lessonId, slideNumber);
  const deck = deckOrder(lessons);
  const at = pos ? deck.findIndex((p) => p.lessonId === pos.lessonId && p.index === pos.index) : -1;
  const prev = deck[at - 1];
  const next = at >= 0 ? deck[at + 1] : undefined;
  const onPrev = prev && (() => onGo(prev));
  const onNext = next && (() => onGo(next));
  useArrowKeys(onPrev, onNext);
  const lesson = pos && course.lessons[pos.lessonId];
  const slide = pos && lesson?.slides[pos.index];
  if (!pos || !lesson || !slide) return null;
  const n = course.lessonOrder.indexOf(lesson.id) + 1;
  const save = (slides: Slide[]) => edit([cmd('slides.update', { lessonId: lesson.id, slides })], { key: 'editedMaterial', values: { kind: 'slides', n } });
  const update = (s: Slide) => save(lesson.slides.map((x) => (x.id === s.id ? s : x)));
  return (
    <div className="flex items-start gap-8">
      <Filmstrip course={course} lessons={lessons} activeId={slide.id} onSelect={onGo} />
      <div className="mx-auto min-w-0 max-w-slide flex-1">
        <StageTools lesson={lesson} slide={slide} index={pos.index} save={save} go={(index) => onGo({ lessonId: lesson.id, index })} />
        <div className="overflow-hidden rounded-sheet shadow-overlay">
          <SlideCanvas key={slide.id} slide={slide} lang={course.language} footer={`${t.common.lesson(n)} · ${lesson.title}`} onChange={update} />
        </div>
        <SlidePager course={course} lesson={lesson} index={pos.index} onPrev={onPrev} onNext={onNext} />
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
