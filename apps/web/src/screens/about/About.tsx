import { Link } from '@tanstack/react-router';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { VERSION } from '../../version';

const CONTACT = 'xingpicture@gmail.com';

/** What a teacher does with Folio, in the order they do it. Each says one thing the others do not. */
const STEPS = [
  { n: '1', title: 'Start from what you have', body: 'A few sentences about the course, or the syllabus, readings and notes you already use.' },
  { n: '2', title: 'Get every lesson, whole', body: 'A plan for each lesson with its slides, quiz, assignment and rubric, written in order so each one builds on the last.' },
  { n: '3', title: 'Make it yours', body: 'Change any word in place, then take it to Word, PowerPoint, PDF or Google Docs.' },
];

/** What a teacher should know before relying on it: said plainly, once. */
const KNOW = [
  'Folio writes in English, for schools and universities in the United States and Canada: grades, credits and semesters as they are used there.',
  'What it writes is a draft for you to read before you teach it. Each plan is checked by a second model, and what that check could not settle is left as a note for you.',
  'For a course that teaches software, attach your notes on the version your students use. Folio lists what it wrote without them, for you to try first.',
];

const LINK = 'rounded-control text-ink-2 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent';

/** What Folio is, who makes it and how to reach them: said once each. Linked from the home page. */
export function About() {
  const t = useT();
  usePageTitle('About Folio');
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-2xl px-5 pb-24 pt-8 md:pt-12">
        <p className="font-ui text-13 font-medium uppercase tracking-wide text-accent">About Folio</p>
        <h1 className="mt-3 font-display text-48 leading-none text-ink">A whole course, written to fit together.</h1>
        <p className="mt-6 font-reading text-18 text-ink-2">Folio is a course builder for teachers in North America, from the early grades to university.</p>

        <ol className="mt-10 divide-y divide-rule border-y border-rule">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-5 py-5">
              <span aria-hidden className="w-6 shrink-0 font-display text-22 leading-7 text-accent">
                {step.n}
              </span>
              <div>
                <h2 className="font-ui text-16 font-semibold leading-7 text-ink">{step.title}</h2>
                <p className="mt-1 font-reading text-16 leading-7 text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-10" aria-labelledby="about-know">
          <h2 id="about-know" className="font-ui text-13 font-medium uppercase tracking-wide text-ink-2">
            Good to know
          </h2>
          <ul className="mt-3 grid gap-3 font-reading text-16 leading-7 text-ink-2">
            {KNOW.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden className="mt-3 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-sheet bg-well p-6">
          <h2 className="font-ui text-13 font-medium uppercase tracking-wide text-ink-2">Made by</h2>
          <p className="mt-2 font-display text-22 text-ink">Tian Xing</p>
          <p className="mt-2 font-reading text-16 leading-7 text-ink-2">
            Questions, ideas, or something that didn’t work: write to{' '}
            <a href={`mailto:${CONTACT}`} className="text-accent underline-offset-4 hover:underline">
              {CONTACT}
            </a>
            . Every message is read.
          </p>
        </section>

        <nav aria-label="More about Folio" className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-ui text-14">
          <Link
            to="/changelog"
            className="inline-flex items-center gap-3 rounded-full border border-rule px-4 py-2 text-ink-2 outline-none transition-colors duration-120 hover:border-field hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="rounded-full bg-accent-tint px-2 py-0.5 font-mono text-13 text-accent" aria-label={t.changelog.version(VERSION)}>
              v{VERSION}
            </span>
            <span>{t.changelog.whatsNew} →</span>
          </Link>
          <Link to="/privacy" className={LINK}>
            Privacy
          </Link>
          <Link to="/terms" className={LINK}>
            Terms
          </Link>
        </nav>
      </main>
    </div>
  );
}
