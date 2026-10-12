import { figureText } from '../i18n/figureText';
import { missingTargets } from '@folio/ai';
import { cmd, newId, orderedLessons, type Course, type Lesson, type Slide, type SlideLayout } from '@folio/core';
import { Button, IconButton, SegmentedControl } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowDownNarrowWide, TrendingDown, ArrowUp, EyeOff, Plus, Search, SearchX, Server, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { startBuild, useBuild } from '../state/build';
import { edit } from '../state/edit';
import { CreditsNote } from '../screens/plan/CreditsNote';
import { focusItem } from './newItems';
import { SlideCanvas } from './SlideCanvas';
import { BlockTools } from './BlockTools';
import { ChartData } from './SlideVisual';
import { FigureControls } from './figures/FigureControls';
import { FigureData, newBinarySearch, newGradientDescent, newRackBudget, newSelectionSort } from './figures/FigureData';
import { FigureRunProvider } from './figures/figureRun';
import { Filmstrip, SlidePager, deckOrder, useArrowKeys, type SlidePos } from './SlideNav';


/** A demonstration is put on the slide or taken off it; a slide with a table or chart keeps that. A second kind is offered where the slide has none. */
function FigureButtons({ slide, set }: { slide: Slide; set: (visual: Slide['visual']) => void }) {
  const has = slide.visual?.kind === 'figure';
  return (
    <>
      <IconButton label={has ? figureText.remove : figureText.add} isDisabled={Boolean(slide.visual) && !has} onPress={() => set(slide.visual ? undefined : newBinarySearch())}>
        {has ? <SearchX size={16} strokeWidth={1.5} /> : <Search size={16} strokeWidth={1.5} />}
      </IconButton>
      {!slide.visual && (
        <IconButton label={figureText.addSort} onPress={() => set(newSelectionSort())}>
          <ArrowDownNarrowWide size={16} strokeWidth={1.5} />
        </IconButton>
      )}
      {!slide.visual && (
        <IconButton label={figureText.addDescent} onPress={() => set(newGradientDescent())}>
          <TrendingDown size={16} strokeWidth={1.5} />
        </IconButton>
      )}
      {!slide.visual && (
        <IconButton label={figureText.addRack} onPress={() => set(newRackBudget())}>
          <Server size={16} strokeWidth={1.5} />
        </IconButton>
      )}
    </>
  );
}

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
    // A new slide starts empty, with the caret in its title.
    const id = newId('x');
    save([...slides.slice(0, index + 1), { id, layout: 'bullets', title: '', bullets: [], notes: '' }, ...slides.slice(index + 1)]);
    go(index + 1);
    focusItem(id);
  };
  const remove = () => {
    save(slides.filter((s) => s.id !== slide.id));
    go(Math.min(index, slides.length - 2));
  };
  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 max-md:hidden">
      {/* Named: four words in a row read as a menu of slides, not as this slide's layout. */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="font-ui text-12 text-ink-2">
          {t.lesson.layout}
        </span>
        <SegmentedControl<SlideLayout>
          label={t.lesson.layout}
          value={slide.layout}
          onChange={(layout) => save(slides.map((s) => (s.id === slide.id ? { ...s, layout } : s)))}
          options={(['title', 'bullets', 'question', 'quote'] as const).map((id) => ({ id, label: t.lesson.layouts[id] }))}
        />
      </div>
      <div className="flex items-center gap-1">
        <IconButton label={t.lesson.moveSlideUp} isDisabled={index === 0} onPress={() => move(index - 1)}>
          <ArrowUp size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.lesson.moveSlideDown} isDisabled={index === slides.length - 1} onPress={() => move(index + 1)}>
          <ArrowDown size={16} strokeWidth={1.5} />
        </IconButton>
        <FigureButtons slide={slide} set={(visual) => save(slides.map((x) => (x.id === slide.id ? { ...x, visual } : x)))} />
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

/** The slide on the stage, and what works it: a demonstration's run is held here, over the slide and its buttons. */
function Stage({ slide, children }: { slide: Slide; children: ReactNode }) {
  if (slide.visual?.kind !== 'figure') return <>{children}</>;
  return <FigureRunProvider visual={slide.visual}>{children}</FigureRunProvider>;
}

/** The lesson and slide to show: the one asked for, clamped to what exists, else the first. */
function resolve(lessons: Lesson[], lessonId: string | undefined, slide: number | undefined): SlidePos | null {
  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  if (!lesson) return null;
  return { lessonId: lesson.id, index: Math.min(lesson.slides.length - 1, Math.max(0, (slide ?? 1) - 1)) };
}

/** No lesson has slides yet: say so and offer to write them, rather than show an empty page. */
function NoSlides({ course }: { course: Course }) {
  const t = useT();
  const running = useBuild((s) => s.running && s.courseId === course.id);
  const missing = missingTargets(course).filter((x) => x.kind === 'slides');
  return (
    <div className="no-print mx-auto max-w-slide rounded-control border border-dashed border-rule-strong px-4 py-5 font-ui text-14 text-ink-2">
      <p>{running ? t.lesson.slidesComing : t.lesson.noSlides}</p>
      {!running && missing.length > 0 && (
        <Button size="sm" variant="secondary" className="mt-3" onPress={() => void startBuild(missing)}>
          {t.lesson.buildThis}
        </Button>
      )}
      {!running && missing.length > 0 && <CreditsNote course={course} targets={missing} />}
    </div>
  );
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
  if (!pos || !lesson || !slide) return <NoSlides course={course} />;
  const n = course.lessonOrder.indexOf(lesson.id) + 1;
  const save = (slides: Slide[]) => edit([cmd('slides.update', { lessonId: lesson.id, slides })], { key: 'editedMaterial', values: { kind: 'slides', n } });
  const update = (s: Slide) => save(lesson.slides.map((x) => (x.id === s.id ? s : x)));
  return (
    <div className="flex items-start gap-8">
      <Filmstrip course={course} lessons={lessons} activeId={slide.id} onSelect={onGo} />
      <div className="mx-auto min-w-0 max-w-slide flex-1">
        <StageTools lesson={lesson} slide={slide} index={pos.index} save={save} go={(index) => onGo({ lessonId: lesson.id, index })} />
        <Stage slide={slide}>
          <div className="overflow-hidden rounded-sheet shadow-overlay">
            <SlideCanvas key={slide.id} slide={slide} lang={course.language} footer={`${t.common.lesson(n)} · ${lesson.title}`} onChange={update} />
          </div>
          <FigureControls />
        </Stage>
        {slide.visual?.kind === 'chart' && <ChartData v={slide.visual} onChange={(visual) => update({ ...slide, visual })} />}
        {slide.visual?.kind === 'figure' && <FigureData v={slide.visual} onChange={(visual) => update({ ...slide, visual })} />}
        <BlockTools slide={slide} onChange={(visual) => update({ ...slide, visual })} />
        <SlidePager course={course} lesson={lesson} index={pos.index} onPrev={onPrev} onNext={onNext} />
        <section className="mt-4 rounded-sheet bg-paper p-5 shadow-sheet">
          <h3 className="mb-2 flex flex-wrap items-center gap-x-1.5 font-ui text-13 font-semibold text-ink">
            <span className="whitespace-nowrap">{t.lesson.speakerNotes}</span>
            <span className="flex items-center gap-1 whitespace-nowrap font-normal text-ink-2">
              · <EyeOff size={12} strokeWidth={1.75} aria-hidden /> {t.quiz.teacherOnly}
            </span>
          </h3>
          <EditableText key={slide.id} as="p" multiline value={slide.notes} label={t.lesson.speakerNotes} placeholder="…" lang={course.language} className="block font-reading text-16 leading-7 text-ink-2" onCommit={(notes) => update({ ...slide, notes })} />
        </section>
      </div>
    </div>
  );
}
