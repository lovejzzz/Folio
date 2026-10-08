import type { Flag } from '@folio/core';

/**
 * What the answer check found, in a teacher's words. The checking program reports for the writer that corrects the
 * item ("computed [50.0] not among the stored ['50/5', '160/5']", "choices stating the computed value: []; keyed: 3"),
 * and when the item could not be corrected the same words were left on the lesson: readers called them unreadable,
 * and a teacher cannot act on what cannot be read. Said once more here, by its parts: where, what was worked out,
 * what the text has.
 */

type Found = Extract<Flag, { code: 'answerCheck' }>;

const WHERE: Record<string, string> = { answerKey: 'answer key', answer: 'answer', explanation: 'explanation', prompt: 'question', steps: 'steps' };

/** A number as a class writes it: 50, not 50.0; and a list of them without the program's brackets. */
const num = (text: string): string => text.trim().replace(/^['"]|['"]$/g, '').replace(/\.$/, '').replace(/^(-?\d+)\.0$/, '$1');
const list = (text: string, most = 4): string => {
  const items = text.split(',').map(num).filter(Boolean);
  return items.slice(0, most).join(', ') + (items.length > most ? ', …' : '');
};
const choices = (text: string): string => {
  const ns = text.split(',').map((n) => n.trim()).filter(Boolean);
  return ns.length ? `choice${ns.length > 1 ? 's' : ''} ${ns.join(' and ')}` : '';
};
const truth = (word: string): string => (/^true$/i.test(word) ? 'true' : 'false');

function claimOf(claim: string): string {
  if (/keyed choice/.test(claim) && /code/.test(claim)) return 'the keyed choice’s code does what is asked';
  if (/keyed choice|agrees with the key/.test(claim)) return 'the keyed choice is the right one';
  if (/explanation says this choice/.test(claim)) return 'what the explanation says a choice does';
  if (/mistake the explanation names/.test(claim)) return 'the mistake the explanation gives for a wrong choice';
  if (/stored answer runs/.test(claim)) return 'the answer runs as written';
  if (/equals the stored answer/.test(claim)) return 'the answer given';
  const stated = /^(\w+): …?(.*)$/s.exec(claim);
  if (stated && WHERE[stated[1]!]) return `a value in the ${WHERE[stated[1]!]}${stated[2]!.trim() ? `, after “${stated[2]!.trim().slice(-40)}”` : ''}`;
  return 'an answer or its explanation';
}

function foundOf(found: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^choices stating the computed value: \[(.*?)\]; keyed: (\d+); computed (.*)$/s.exec(found)))
    return `worked out, the answer is ${num(m[3]!)}, ${m[1]!.trim() ? `which ${choices(m[1]!)} state${m[1]!.includes(',') ? '' : 's'}` : 'which no choice states'}; choice ${m[2]} is keyed`;
  if ((m = /^choices whose stored code does the job: \[(.*?)\]; keyed: (\d+)/.exec(found)))
    return `run as written, ${m[1]!.trim() ? `${choices(m[1]!)} did it` : 'no choice did it'}; choice ${m[2]} is keyed`;
  if ((m = /^statement computed (\w+); keyed:? (\w+)/.exec(found))) return `worked out, the statement is ${truth(m[1]!)}, and the key has it as ${truth(m[2]!)}`;
  if ((m = /^computed \[(.*?)\] not among the stored \[(.*?)(?:\]|$)/s.exec(found))) return `worked out, it is ${list(m[1]!)}; the text there has ${list(m[2]!)}`;
  if ((m = /^stored has (\d+) numbers \[(.*?)\], computed (\d+): \[(.*?)(?:\]|$)/s.exec(found))) return `worked out, there are ${m[3]} values (${list(m[4]!)}) where the text gives ${m[1]} (${list(m[2]!)})`;
  if (/^stored\/computed differ:/.test(found)) return 'worked out, the values come out differently from the ones given';
  if ((m = /^computed (\S+); stored range (\S+)\.\.(\S+)/.exec(found))) return `worked out, it is ${num(m[1]!)}, outside the ${num(m[2]!)} to ${num(m[3]!)} given`;
  if ((m = /^stored (.*) computed (.*)$/s.exec(found))) return `worked out, it is ${num(m[2]!)}; the text has ${num(m[1]!)}`;
  if ((m = /^stored answer does not run as written: (.*)$/s.exec(found))) return `it stops with ${m[1]!.split('\n')[0]!.slice(0, 120)}`;
  if ((m = /^choice (\d+), tested as:/.exec(found))) return `choice ${m[1]} does not do what is said of it`;
  return 'worked out by a program, it comes out differently';
}

/** The note as a teacher reads it: no brackets, no quotes of the program's own, a message's first line only. */
export const plainNote = (flag: Found): Found => ({ code: 'answerCheck', values: { claim: claimOf(flag.values.claim), found: foundOf(flag.values.found).replace(/[[\]{}]/g, '') } });
