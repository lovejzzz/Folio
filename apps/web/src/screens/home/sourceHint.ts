/**
 * The brief asks for work on sources, or names the teacher's own notes. With
 * nothing attached, the model can only name extracts, never quote them, so
 * the composer suggests attaching them. "Sources of energy" is not a match.
 */
const ASKS_FOR_SOURCES = [
  /\bsource[- ](?:analysis|work|based|questions?|skills?)\b/i,
  /\b(?:primary|historical|original) (?:sources?|documents?)\b/i,
  /\b(?:built|based) (?:on|around|from) my\b/i,
  /\bmy (?:own )?(?:notes|slides|handouts?|worksheets?|readings?)\b/i,
  /史料|原始资料|原始文献|材料分析|我的(?:讲义|笔记|课件|教案)/,
];

export function asksForSources(brief: string): boolean {
  return ASKS_FOR_SOURCES.some((re) => re.test(brief));
}
