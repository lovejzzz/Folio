import { SHAPE_LIMITS, cmd, lessonSessions, orderedLessons, type Course, type Session, type SessionKind } from '@folio/core';
import { IconButton, NumberStepper } from '@folio/ui';
import { Plus, X } from 'lucide-react';
import { useT } from '../../i18n';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';

const KINDS: SessionKind[] = ['class', 'lecture', 'seminar', 'lab', 'problems'];
const MAX_SESSIONS = 3;
/** A lesson's sessions together, as the course schema allows. */
const MAX_TOTAL = 900;

/** Sessions and the lesson's length go together: the length is always their sum. */
function shapeFor(sessions: Session[]) {
  return sessions.length > 1 ? { sessions, minutesPerLesson: sessions.reduce((a, s) => a + s.minutes, 0) } : { sessions: [], minutesPerLesson: sessions[0]!.minutes };
}

function saveSessions(sessions: Session[]): void {
  edit([cmd('course.update', { shape: shapeFor(sessions) })], { key: 'changedShape' });
}

/**
 * Take a session away, with its steps: the lecture's steps don't belong in the
 * seminar, and the steps after it move up a place. One change, so one undo.
 */
function removeSession(course: Course, sessions: Session[], gone: number): void {
  const plans = orderedLessons(course)
    .filter((l) => l.segments.some((seg) => seg.session >= gone))
    .map((l) => cmd('plan.update', { lessonId: l.id, segments: l.segments.filter((seg) => seg.session !== gone).map((seg) => (seg.session > gone ? { ...seg, session: seg.session - 1 } : seg)) }));
  edit([cmd('course.update', { shape: shapeFor(sessions.filter((_, j) => j !== gone)) }), ...plans], { key: 'changedShape' });
}

/**
 * How long each lesson is, and, when it meets more than once, what each
 * meeting is: a lecture and a seminar, a class and a lab. One class needs no
 * more than "Minutes each"; a second session is one click away.
 */
export function Sessions() {
  const t = useT();
  const course = useCourse();
  const { minutesPerLesson: limits } = SHAPE_LIMITS;
  const sessions = lessonSessions(course);
  const multi = sessions.length > 1;
  const set = (i: number, patch: Partial<Session>) => saveSessions(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => saveSessions(multi ? [...sessions, { kind: 'seminar', minutes: 50 }] : [{ kind: 'lecture', minutes: sessions[0]!.minutes }, { kind: 'seminar', minutes: 50 }]);
  return (
    <div className="space-y-2">
      {multi ? (
        <>
          <p className="font-ui text-14 text-ink">{t.sessions.each}</p>
          {sessions.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                aria-label={t.sessions.kindOf(i + 1)}
                value={s.kind}
                onChange={(e) => set(i, { kind: e.target.value as SessionKind })}
                className="h-8 min-w-0 flex-1 rounded-control border border-field bg-paper px-2 font-ui text-14 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t.sessions.kinds[k]}
                  </option>
                ))}
              </select>
              <NumberStepper hideLabel label={t.sessions.minutesOf(i + 1)} minValue={5} maxValue={Math.min(300, MAX_TOTAL - sessions.reduce((a, x, j) => (j === i ? a : a + x.minutes), 0))} step={limits.step} value={s.minutes} onChange={(v) => Number.isFinite(v) && set(i, { minutes: v })} />
              <IconButton size="sm" label={t.sessions.remove(i + 1)} onPress={() => removeSession(course, sessions, i)}>
                <X size={14} strokeWidth={1.5} />
              </IconButton>
            </div>
          ))}
        </>
      ) : (
        <NumberStepper label={t.plan.minutes} minValue={limits.min} maxValue={limits.max} step={limits.step} value={course.shape.minutesPerLesson} onChange={(v) => Number.isFinite(v) && saveSessions([{ kind: 'class', minutes: v }])} />
      )}
      {sessions.length < MAX_SESSIONS && (
        <button type="button" onClick={add} title={t.sessions.hint} className="inline-flex items-center gap-1.5 rounded-control px-1 py-0.5 font-ui text-13 text-ink-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent">
          <Plus size={13} strokeWidth={1.75} aria-hidden />
          {t.sessions.add}
        </button>
      )}
    </div>
  );
}
