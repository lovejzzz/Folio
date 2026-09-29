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
  return <LegalPage title="About Folio" text={about} />;
}
