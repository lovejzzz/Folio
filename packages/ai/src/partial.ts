/**
 * The JSON a model has written so far, read as far as it goes, so a section can
 * be shown taking shape while it streams in. A string still being written is
 * kept as far as it got (that is the text appearing); a key with no value yet,
 * or a number or word cut off mid-way, is left out. Undefined until an object
 * has begun, or if what came can't be read at all.
 */
export function parsePartialJson(text: string): unknown {
  const begin = text.indexOf('{');
  if (begin < 0) return undefined;
  const src = text.slice(begin);
  const stack: string[] = [];
  let inString = false;
  let isKey = false;
  let stringStart = 0;
  // A key whose value hasn't begun: cut from here if the text ends before it does.
  let pendingKey = -1;
  let prev = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') {
        inString = false;
        if (isKey) pendingKey = stringStart;
        prev = '"';
      }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '"') {
      inString = true;
      stringStart = i;
      isKey = stack.at(-1) === '{' && (prev === '{' || prev === ',');
      if (!isKey) pendingKey = -1;
      continue;
    }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
    if (c !== ':' && c !== ',') pendingKey = -1;
    prev = c;
  }
  let body: string;
  if (inString && isKey) body = src.slice(0, stringStart);
  else if (inString) body = `${src.replace(/\\(?:u[0-9a-fA-F]{0,3})?$/, '')}"`;
  else if (pendingKey >= 0) body = src.slice(0, pendingKey);
  else body = src;
  body = body
    .trimEnd()
    // A word or number cut off mid-way ("tr", "fals", "-", "1.", "2e").
    .replace(/(?:\b(?:t|tr|tru|f|fa|fal|fals|n|nu|nul)|-|\d+\.|\d+(?:\.\d+)?[eE][+-]?)$/, '')
    .trimEnd()
    // ...which may leave a key with nothing after its colon.
    .replace(/"(?:[^"\\]|\\.)*"\s*:$/, '')
    .trimEnd()
    .replace(/,$/, '');
  const closers = stack.reverse().map((b) => (b === '{' ? '}' : ']')).join('');
  try {
    return JSON.parse(body + closers) as unknown;
  } catch {
    return undefined;
  }
}
