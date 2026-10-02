import type { Clarification, ClarifyDraft } from '@folio/ai';
import { Button, Kbd, cx } from '@folio/ui';
import { ArrowLeft, ArrowRight, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { clarifyText as c } from './clarifyText';

type Question = ClarifyDraft['questions'][number];
/** One of the three answers, by index, or the teacher's own words. */
type Choice = { pick: number } | { own: string } | null;

const answerOf = (q: Question, choice: Choice): string => (!choice ? '' : 'pick' in choice ? (q.options[choice.pick] ?? '') : choice.own.trim());

/** How far along: one segment per question, the current one in the accent colour. */
function Progress({ at, of }: { at: number; of: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full transition-colors duration-200', i < at ? 'bg-ink-2' : i === at ? 'bg-accent' : 'bg-rule')} />
        ))}
      </div>
      <span className="font-ui text-13 tabular-nums text-ink-2" aria-live="polite" aria-label={c.progressLabel(at + 1, of)}>
        {c.progress(at + 1, of)}
      </span>
    </div>
  );
}

function Options({ question, choice, onPick }: { question: Question; choice: Choice; onPick: (i: number, moveOn: boolean) => void }) {
  const value = choice && 'pick' in choice ? String(choice.pick) : null;
  // Arrow keys move through the answers, choosing each as they pass: only a click or a tap moves on by itself.
  const byKey = useRef(false);
  return (
    <div onKeyDownCapture={() => void (byKey.current = true)} onPointerDownCapture={() => void (byKey.current = false)}>
    <RadioGroup aria-label={c.answers} value={value} onChange={(v) => onPick(Number(v), !byKey.current)} className="grid gap-2">
      {question.options.map((option, i) => (
        <Radio
          key={option}
          value={String(i)}
          className={cx(
            'group flex cursor-default items-center gap-3 rounded-sheet border border-rule bg-paper px-4 py-3.5 outline-none transition-colors duration-120',
            'data-hovered:border-field data-selected:border-accent data-selected:bg-accent-tint data-focus-visible:ring-2 data-focus-visible:ring-accent',
          )}
        >
          <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full border border-field bg-paper group-data-selected:border-accent">
            <span className="size-2 rounded-full bg-accent opacity-0 transition-opacity duration-120 group-data-selected:opacity-100" />
          </span>
          <span className="flex-1 font-reading text-17 leading-snug text-ink">{option}</span>
          <span className="hidden sm:inline-flex" aria-hidden>
            <Kbd>{i + 1}</Kbd>
          </span>
        </Radio>
      ))}
    </RadioGroup>
    </div>
  );
}

/** The fourth answer: the teacher's own words. Typing chooses it; Enter moves on. */
function OwnAnswer({ choice, onChange, onEnter }: { choice: Choice; onChange: (text: string) => void; onEnter: () => void }) {
  const own = choice && 'own' in choice ? choice.own : '';
  const chosen = Boolean(own.trim());
  return (
    <label
      className={cx(
        'mt-2 flex items-center gap-3 rounded-sheet border border-dashed px-4 py-3 transition-colors duration-120 focus-within:border-solid focus-within:border-accent',
        chosen ? 'border-solid border-accent bg-accent-tint' : 'border-field bg-paper',
      )}
    >
      <PenLine size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
      <span className="sr-only">{c.other}</span>
      <input
        value={own}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && own.trim()) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={c.otherPlaceholder}
        className="min-w-0 flex-1 bg-transparent font-reading text-17 text-ink outline-none placeholder:text-ink-3"
      />
    </label>
  );
}

function Footer({ first, last, answered, onBack, onNext }: { first: boolean; last: boolean; answered: boolean; onBack: () => void; onNext: () => void }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {first ? (
        <span />
      ) : (
        <Button variant="quiet" onPress={onBack}>
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          {c.back}
        </Button>
      )}
      <Button variant={answered || last ? 'primary' : 'quiet'} size="lg" className="pl-5 pr-4" onPress={onNext}>
        {last ? c.finish : answered ? c.next : c.skip}
        <ArrowRight size={17} strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
  );
}

/** 1, 2 and 3 pick an answer, and Enter moves on (from an answer arrowed to as well), unless the teacher is typing their own. */
function useKeys(onPick: (i: number) => void, onNext: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input:not([type="radio"]), textarea, [contenteditable]'))) return;
      if (/^[1-3]$/.test(e.key)) onPick(Number(e.key) - 1);
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) onNext();
    };
    // Heard on the way down: a focused answer keeps its key presses from travelling back up.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onPick, onNext]);
}

/**
 * Folio's questions about this course, one at a time: three answers written for it, or the teacher's own.
 * Choosing an answer moves on by itself; any question can be skipped, and so can all of them.
 */
export function Questions({ questions, onDone }: { questions: Question[]; onDone: (answers: Clarification[]) => void }) {
  const [at, setAt] = useState(0);
  const [back, setBack] = useState(false);
  const [choices, setChoices] = useState<Choice[]>(() => questions.map(() => null));
  const advance = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advance.current), []);
  const question = questions[at]!;
  const last = at === questions.length - 1;
  const finish = (list = choices) => onDone(questions.map((q, i) => ({ question: q.question, answer: answerOf(q, list[i] ?? null) })));
  const next = (list = choices) => {
    clearTimeout(advance.current);
    if (last) return finish(list);
    setBack(false);
    setAt(at + 1);
  };
  const choose = (choice: Choice) => setChoices((all) => all.map((old, i) => (i === at ? choice : old)));
  const pick = (i: number, moveOn = true) => {
    const list = choices.map((old, j) => (j === at ? { pick: i } : old));
    setChoices(list);
    // A moment to see the choice land, then on; the last question waits for "Plan the course".
    clearTimeout(advance.current);
    if (!last && moveOn) advance.current = setTimeout(() => next(list), 260);
  };
  useKeys(pick, () => next());
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="hidden font-ui text-13 font-medium text-ink-2 sm:block">{c.eyebrow}</p>
        <button type="button" onClick={() => finish()} className="ml-auto whitespace-nowrap rounded-control font-ui text-13 text-ink-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent">
          {c.skipAll}
        </button>
      </div>
      <div className="mt-3">
        <Progress at={at} of={questions.length} />
      </div>
      <div key={at} className={back ? 'animate-step-back' : 'animate-step-in'}>
        <h1 className="mt-7 font-display text-28 leading-tight text-ink md:text-36">{question.question}</h1>
        <div className="mt-6">
          <Options question={question} choice={choices[at] ?? null} onPick={pick} />
          <OwnAnswer choice={choices[at] ?? null} onChange={(own) => choose(own ? { own } : null)} onEnter={() => next()} />
        </div>
      </div>
      <Footer
        first={at === 0}
        last={last}
        answered={Boolean(answerOf(question, choices[at] ?? null))}
        onBack={() => {
          clearTimeout(advance.current);
          setBack(true);
          setAt(at - 1);
        }}
        onNext={() => next()}
      />
    </div>
  );
}
