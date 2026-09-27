import { docLabels, type Language } from '@folio/core';
import type { AssignmentDraft, DiscussionsDraft, QuestionDraft } from './schemas';

/**
 * Small, certain fixes made locally instead of by a repair call, which would
 * resend the whole request and answer. Each one only restates what the model
 * clearly meant; anything unclear is left for the checks to flag.
 */

const TRUE = /^(true|t|yes|correct|正确|对|是)$/i;
const FALSE = /^(false|f|no|incorrect|错误|错|否)$/i;

/** A true/false question's choices are always the course language's two words; the model's answer is mapped onto them. */
export function tidyTrueFalse(q: QuestionDraft, language: Language): QuestionDraft {
  if (q.format !== 'truefalse') return q;
  const answer = q.answer.trim().replace(/[.。]$/, '');
  const truth = TRUE.test(answer) ? true : FALSE.test(answer) ? false : null;
  if (truth === null) return q;
  const { trueWord, falseWord } = docLabels(language);
  return { ...q, choices: [trueWord, falseWord], answer: truth ? trueWord : falseWord };
}

/** The page numbers the steps, so a number the model wrote in would show twice. */
export function tidySteps(v: AssignmentDraft): AssignmentDraft {
  return { ...v, steps: v.steps.map((s) => s.replace(/^\s*(?:step\s*\d{1,2}\s*[.:)：]|\d{1,2}(?:[.)]\s|、))\s*/i, '').replace(/^\s*第[一二三四五六七八九十\d]+步\s*[:：、]?\s*/, '')) };
}

export const FOLLOW_UPS = 3;

/** Follow-ups are optional prompts for the teacher: past three, the extras are dropped. */
export function tidyFollowUps(v: DiscussionsDraft): DiscussionsDraft {
  return { discussions: v.discussions.map((d) => ({ ...d, followUps: d.followUps.slice(0, FOLLOW_UPS) })) };
}
