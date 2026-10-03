import type { MaterialKind } from './materials';
import type { Language, QuestionFormat, SlideLayout } from './schema';

/**
 * A SemanticDoc is what a material looks like once projected: headings,
 * paragraphs, tables, questions and slides, already filtered for one
 * audience. Every exporter and the print view read this, never the course.
 */

export type Audience = 'student' | 'teacher';

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; text: string; anchor?: string }
  | { t: 'para'; text: string; tone?: 'lead' | 'muted' }
  | { t: 'list'; ordered: boolean; items: string[] }
  | { t: 'meta'; items: { label: string; value: string }[] }
  | { t: 'table'; head: string[]; rows: string[][]; widths?: number[] }
  | { t: 'terms'; items: { term: string; definition: string }[] }
  | { t: 'note'; label: string; text: string }
  /** A picture of a module page, once it is made. Print shows it; a Word file gives its caption and what it shows. */
  | { t: 'image'; src: string; alt: string; caption: string }
  | {
      t: 'question';
      n: number;
      format: QuestionFormat;
      prompt: string;
      choices: string[];
      answer?: string;
      explanation?: string;
    }
  | { t: 'slide'; n: number; layout: SlideLayout; title: string; bullets: string[]; notes?: string; lesson: string }
  | { t: 'answers'; title: string; items: { n: number; answer: string }[] }
  | { t: 'break' };

export interface SemanticDoc {
  kind: MaterialKind;
  title: string;
  subtitle: string;
  language: Language;
  audience: Audience;
  blocks: Block[];
}

export interface ProjectOptions {
  audience: Audience;
  /** Limit to these lessons; all lessons when omitted. */
  lessonIds?: readonly string[];
}
