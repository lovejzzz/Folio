import { z } from 'zod';

/**
 * "Needs a look" notes. Checks record what is wrong as a code plus values,
 * never as a sentence, so the interface can word each note in the teacher's
 * language and the repair prompt can word it for the model.
 */

const plain = <C extends string>(code: C) => z.object({ code: z.literal(code) });
const withValues = <C extends string, V extends z.ZodRawShape>(code: C, values: V) =>
  z.object({ code: z.literal(code), values: z.object(values) });

const count = { got: z.number(), want: z.number() };

export const FlagSchema = z.discriminatedUnion('code', [
  plain('noPrompt'),
  plain('tooFewChoices'),
  plain('trueFalseChoices'),
  plain('emptyChoice'),
  plain('duplicateChoices'),
  plain('answerNotInChoices'),
  plain('noModelAnswer'),
  plain('answerNotNumber'),
  withValues('answerMismatch', { stated: z.string(), computed: z.string() }),
  withValues('minutesMismatch', { total: z.number(), target: z.number() }),
  withValues('unknownObjective', { objective: z.number() }),
  plain('repeatsQuestion'),
  plain('answerStandsOut'),
  withValues('questionCount', count),
  withValues('lessonCount', count),
  withValues('criterionLevels', { criterion: z.string() }),
  /** The model's answer did not fit the schema. Only ever quoted back to the model. */
  withValues('schemaIssue', { path: z.string(), issue: z.string() }),
  /** A sentence stored by an older version of Folio, shown as it was written. */
  withValues('note', { text: z.string() }),
]);
export type Flag = z.infer<typeof FlagSchema>;
export type FlagCode = Flag['code'];

/** The values a flag carries, by code; an empty object for codes that carry none. */
export type FlagValues<C extends FlagCode> = Extract<Flag, { code: C }> extends { values: infer V } ? V : Record<string, never>;

export function flagValues<F extends Flag>(flag: F): FlagValues<F['code']> {
  return ('values' in flag ? flag.values : {}) as FlagValues<F['code']>;
}

/** English wording of a flag, for the repair prompt sent to the model. */
export function describeFlag(flag: Flag): string {
  switch (flag.code) {
    case 'noPrompt':
      return 'The question has no text.';
    case 'tooFewChoices':
      return 'A multiple-choice question needs at least three choices.';
    case 'trueFalseChoices':
      return 'A true/false question needs exactly two choices.';
    case 'emptyChoice':
      return 'One of the choices is empty.';
    case 'duplicateChoices':
      return 'Two of the choices are the same.';
    case 'answerNotInChoices':
      return 'The answer is not one of the choices.';
    case 'noModelAnswer':
      return 'The question has no model answer.';
    case 'answerNotNumber':
      return 'The answer to a numeric question is not a number.';
    case 'answerMismatch':
      return `The stated answer (${flag.values.stated}) does not match the working (${flag.values.computed}).`;
    case 'minutesMismatch':
      return `The segments add up to ${flag.values.total} minutes, not ${flag.values.target}.`;
    case 'unknownObjective':
      return `It refers to objective ${flag.values.objective}, which does not exist.`;
    case 'repeatsQuestion':
      return 'It repeats an earlier question.';
    case 'answerStandsOut':
      return 'The right answer is noticeably longer and more detailed than every wrong choice, so it can be picked by its length. Rewrite the wrong choices to be as long, specific and plausible as the right one (or trim the right one), keeping the right answer correct.';
    case 'questionCount':
      return `There ${flag.values.got === 1 ? 'is 1 question' : `are ${flag.values.got} questions`} instead of ${flag.values.want}.`;
    case 'lessonCount':
      return `There ${flag.values.got === 1 ? 'is 1 lesson' : `are ${flag.values.got} lessons`} instead of ${flag.values.want}.`;
    case 'criterionLevels':
      return `The rubric criterion "${flag.values.criterion}" does not describe every level.`;
    case 'schemaIssue':
      return `${flag.values.path}: ${flag.values.issue}`;
    case 'note':
      return flag.values.text;
  }
}
