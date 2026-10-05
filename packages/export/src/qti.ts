import { courseLabels, lessonQuestions, orderedLessons, type Course, type Lesson, type Question } from '@folio/core';
import { zipFiles } from './bundle';
import { escapeXml } from './xml';

/**
 * The quizzes as a package Canvas takes in (Settings › Import Course Content › QTI .zip file): one quiz for each
 * lesson that has questions, with its key, so nothing is typed in again. The format is QTI 1.2 as Canvas's
 * Classic Quizzes read it: teachers report that packages written for anything newer import in part or not at all.
 * A question with one right choice is scored by Canvas; a numeric one is scored by its number; a short answer
 * becomes an essay question with the model answer as the comment a student sees afterwards.
 */

/** Course text as the HTML a quiz shows: escaped, with code and bold as the page sets them. */
function html(text: string): string {
  const fenced = escapeXml(text).replace(/`([^`]*\n[^`]*)`/g, (_, code: string) => `<pre>${code}</pre>`);
  const marked = fenced.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return marked
    .split(/\n{2,}/)
    .map((p) => (p.startsWith('<pre>') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
    .join('');
}

/** HTML inside an XML element: escaped once more, as QTI carries it. */
const mat = (text: string): string => `<material><mattext texttype="text/html">${escapeXml(html(text))}</mattext></material>`;
const field = (label: string, value: string): string => `<qtimetadatafield><fieldlabel>${label}</fieldlabel><fieldentry>${escapeXml(value)}</fieldentry></qtimetadatafield>`;

/** The number a numeric answer states, when it states one: "12.5 g" is 12.5. */
function numberIn(answer: string): number | null {
  const found = /-?\d+(?:,\d{3})*(?:\.\d+)?/.exec(answer.replace(/−/g, '-'));
  const value = found ? Number(found[0].replace(/,/g, '')) : NaN;
  return Number.isFinite(value) ? value : null;
}

type Kind = 'multiple_choice_question' | 'true_false_question' | 'numerical_question' | 'essay_question';

function kindOf(q: Question): Kind {
  const keyed = q.choices.some((c) => c.id === q.correct);
  if (q.format === 'truefalse' && keyed) return 'true_false_question';
  if (q.format === 'choice' && keyed) return 'multiple_choice_question';
  if (q.format === 'numeric' && numberIn(q.answer) !== null) return 'numerical_question';
  // What Canvas cannot mark by itself is a question a teacher reads.
  return 'essay_question';
}

function response(q: Question, kind: Kind): { presentation: string; scoring: string } {
  if (kind === 'multiple_choice_question' || kind === 'true_false_question') {
    const labels = q.choices.map((c, i) => `<response_label ident="c${i + 1}">${mat(c.text)}</response_label>`).join('');
    const right = q.choices.findIndex((c) => c.id === q.correct) + 1;
    return {
      presentation: `<response_lid ident="response1" rcardinality="Single"><render_choice>${labels}</render_choice></response_lid>`,
      scoring: `<respcondition continue="No"><conditionvar><varequal respident="response1">c${right}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`,
    };
  }
  if (kind === 'numerical_question') {
    const n = numberIn(q.answer)!;
    // Marked right within half of the last place the answer gives: 12.5 takes 12.45 to 12.55.
    const places = (/\.(\d+)/.exec(String(n))?.[1] ?? '').length;
    const slack = 0.5 * 10 ** -places;
    return {
      presentation: `<response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str>`,
      scoring: `<respcondition continue="No"><conditionvar><or><varequal respident="response1">${n}</varequal><and><vargte respident="response1">${n - slack}</vargte><varlte respident="response1">${n + slack}</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`,
    };
  }
  return { presentation: `<response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>`, scoring: '' };
}

function item(q: Question, n: number): string {
  const kind = kindOf(q);
  const { presentation, scoring } = response(q, kind);
  // What a student sees once they have answered: the explanation, and for a question a teacher reads, the model answer.
  const after = [kind === 'essay_question' || kind === 'numerical_question' ? q.answer : '', q.explanation].filter((t) => t.trim()).join('\n\n');
  const feedback = after ? `<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>` : '';
  return [
    `<item ident="q${n}" title="Question ${n}">`,
    `<itemmetadata><qtimetadata>${field('question_type', kind)}${field('points_possible', '1')}</qtimetadata></itemmetadata>`,
    `<presentation>${mat(q.prompt)}${presentation}</presentation>`,
    `<resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>${feedback}${scoring}</resprocessing>`,
    after ? `<itemfeedback ident="general_fb"><flow_mat>${mat(after)}</flow_mat></itemfeedback>` : '',
    '</item>',
  ].join('');
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

function assessment(id: string, title: string, questions: Question[]): string {
  return `${HEAD}<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd"><assessment ident="${id}" title="${escapeXml(title)}"><qtimetadata>${field('cc_maxattempts', 'unlimited')}</qtimetadata><section ident="root_section">${questions.map((q, i) => item(q, i + 1)).join('')}</section></assessment></questestinterop>`;
}

/** What Canvas keeps about the quiz beside its questions: a practice quiz, not yet published, any number of tries. */
function meta(id: string, title: string, points: number): string {
  return `${HEAD}<quiz identifier="${id}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd"><title>${escapeXml(title)}</title><description></description><shuffle_answers>true</shuffle_answers><scoring_policy>keep_highest</scoring_policy><quiz_type>practice_quiz</quiz_type><points_possible>${points}</points_possible><show_correct_answers>true</show_correct_answers><allowed_attempts>-1</allowed_attempts><one_question_at_a_time>false</one_question_at_a_time></quiz>`;
}

function manifest(ids: string[]): string {
  const resources = ids.map((id) => `<resource identifier="${id}" type="imsqti_xmlv1p2"><file href="${id}/${id}.xml"/><dependency identifierref="${id}_meta"/></resource><resource identifier="${id}_meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${id}/assessment_meta.xml"><file href="${id}/assessment_meta.xml"/></resource>`);
  return `${HEAD}<manifest identifier="folio_quizzes" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd"><metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion></metadata><organizations/><resources>${resources.join('')}</resources></manifest>`;
}

/** The lessons that have questions, each with the name its quiz takes. */
function quizzes(course: Course, lessonIds?: readonly string[]): { lesson: Lesson; title: string; questions: Question[] }[] {
  const l = courseLabels(course);
  return orderedLessons(course)
    .filter((lesson) => !lessonIds || lessonIds.includes(lesson.id))
    .map((lesson) => ({ lesson, title: `${l.lesson(course.lessonOrder.indexOf(lesson.id) + 1)}: ${lesson.title}`, questions: lessonQuestions(course, lesson) }))
    .filter((q) => q.questions.length > 0);
}

export function renderQti(course: Course, lessonIds?: readonly string[]): Uint8Array {
  const all = quizzes(course, lessonIds);
  const text = (s: string) => new TextEncoder().encode(s);
  const files = all.flatMap(({ title, questions }, i) => {
    const id = `folio_quiz_${i + 1}`;
    return [
      { name: `${id}/${id}.xml`, bytes: text(assessment(id, title, questions)) },
      { name: `${id}/assessment_meta.xml`, bytes: text(meta(id, title, questions.length)) },
    ];
  });
  return zipFiles([{ name: 'imsmanifest.xml', bytes: text(manifest(all.map((_, i) => `folio_quiz_${i + 1}`))) }, ...files]);
}
