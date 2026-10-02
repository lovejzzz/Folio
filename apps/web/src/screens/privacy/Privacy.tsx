import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { useT } from '../../i18n';
import { policy } from './policy';

const EMAIL = /([\w.+-]+@[\w-]+\.[\w.-]+\w)/;

/** Plain text with any email address turned into a mail link. */
function WithMail({ text }: { text: string }) {
  return text.split(EMAIL).map((part, i) =>
    i % 2 ? (
      <a key={part} href={`mailto:${part}`} className="text-accent underline-offset-4 hover:underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

interface LegalText {
  updated?: string;
  lede: string;
  sections: readonly { heading: string; body: string }[];
}

/** A page of plain text in sections: the privacy policy, the terms, about Folio. */
export function LegalPage({ title, text }: { title: string; text: LegalText }) {
  usePageTitle(title);
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-2xl px-5 pb-24 pt-8 md:pt-12">
        <h1 className="font-display text-48 leading-none text-ink">{title}</h1>
        {text.updated && <p className="mt-3 font-ui text-13 text-ink-2">{text.updated}</p>}
        <p className="mt-8 font-reading text-18 text-ink">{text.lede}</p>
        <div className="mt-10 space-y-8">
          {text.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-22 text-ink">{section.heading}</h2>
              <p className="mt-2 font-reading text-16 leading-7 text-ink-2">
                <WithMail text={section.body} />
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

/** What Folio keeps, where it goes, and what Google access it asks for. Linked from the home page. */
export function Privacy() {
  const t = useT();
  return <LegalPage title={t.privacy.title} text={policy} />;
}
