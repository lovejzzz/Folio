import { Link } from '@tanstack/react-router';
import { useT } from '../../i18n';
import { VERSION } from '../../version';
import { LegalPage } from '../privacy/Privacy';

const about = {
  lede: 'Folio turns a few sentences about a course, or the syllabus you already have, into the whole course: lesson plans, the materials each lesson uses, and the assessments, written to fit together and ready to teach.',
  sections: [
    {
      heading: 'Who makes Folio',
      body: 'Folio is made by Tian Xing, its founder, for teachers in North America, from the early grades to university.',
    },
    {
      heading: 'Get in touch',
      body: 'Questions, ideas, or something that didn’t work: write to xingpicture@gmail.com. Every message is read.',
    },
  ],
};

/** Who makes Folio and how to reach them. Linked from the home page. */
export function About() {
  const t = useT();
  return (
    <LegalPage title="About Folio" text={about}>
      <Link
        to="/changelog"
        className="mt-12 inline-flex items-center gap-3 rounded-full border border-rule px-4 py-2 font-ui text-14 text-ink-2 outline-none transition-colors duration-120 hover:border-field hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="rounded-full bg-accent-tint px-2 py-0.5 font-mono text-13 text-accent" aria-label={t.changelog.version(VERSION)}>
          v{VERSION}
        </span>
        <span>{t.changelog.whatsNew} →</span>
      </Link>
    </LegalPage>
  );
}
